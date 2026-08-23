# dsh-workbuddy-connect 插件改造说明（WorkBuddy 管路）

本说明记录对 `dsh-workbuddy-connect` 插件在 **WorkBuddy 管路（workbuddy provider）** 下的针对性改造。
目标是让 DSH 通过 WorkBuddy 上游（copilot.tencent.com 等）调用模型时，**思考等级（reasoning effort）真正生效且不报错**，
同时按模型实际能力精确暴露可选档位。

> 改动范围仅限本插件（`src/` 下若干文件 + 构建产物覆盖到 profile 的 `node_modules`）。
> **不影响 DSH 内置 / 官方 provider 的模型**（如 `deepseek-v4-flash-vision-exp` 等，它们走 pi-ai 内置模型目录，与本插件无关）。

---

## 1. 背景问题

WorkBuddy 上游与标准 OpenAI 接口存在三处不兼容，导致直接在 DSH 调用会失败或思考被吞：

| 现象 | 根因 |
| --- | --- |
| `502: workbuddy upstream ... code 11128 "Illegal API invocation from an unapproved channel"` | DSH（pi-ai）以 OpenAI 的 `developer` 角色发送系统提示，WB 上游只接受 `system` 角色 |
| hy3 选了 High 却“没思考”（实际 `no_think`） | WB 上游**只认扁平的 `reasoning_effort` 字段**；若发送嵌套 `reasoning:{effort,summary}` 会被忽略且压制思考 |
| 思考等级档位要么全丢、要么误伤 | 最初用全局映射表一刀切去掉 `medium`，会误删 deepseek-v4 等本支持 `medium` 的模型 |

---

## 2. 核心改动

### 2.1 角色归一：`developer` → `system` （修复 11128）
**文件**：`src/upstream.ts` — `normalizeRoles()`，由 `prepareChatBody()` 调用。

WB 上游对 `developer` 角色直接返回 `11128`。把消息体中所有 `role === "developer"` 改写为 `"system"`，通过渠道校验。

```ts
function normalizeRoles(obj: Record<string, unknown>): void {
  const messages = obj['messages']
  if (!Array.isArray(messages)) return
  for (const message of messages) {
    if (typeof message === 'object' && message !== null && message['role'] === 'developer') {
      message['role'] = 'system'
    }
  }
}
```

### 2.2 思考字段归一：只透传扁平 `reasoning_effort` （修复思考被吞）
**文件**：`src/upstream.ts` — `normalizeReasoning()`，由 `prepareChatBody()` 调用。

WB 上游仅识别扁平 `reasoning_effort`（取值 `off`/`low`/`medium`/`high`）。pi-ai 在某些情况下会产生嵌套 `reasoning:{effort,summary}` 对象，该对象 WB 不识别且会**压制思考**。
做法：直接 `delete obj['reasoning']`，让扁平 `reasoning_effort` 原样透传。

```ts
function normalizeReasoning(obj: Record<string, unknown>): void {
  // 嵌套 reasoning 对象会被 WB 忽略并抑制思考；扁平 reasoning_effort 由 pi-ai 注入，直接透传。
  delete obj['reasoning']
}
```

> 已实证：发送 `reasoning_effort:"high"` 时 WB 返回真实 `reasoning_content`（reasoning 长度约 1300+）；`"off"` 关闭思考；`"low"` 轻度思考。

### 2.3 按模型精确暴露思考档位 （不再一刀切）
**新增字段**：`src/upstream.ts` — `WorkBuddyUpstreamModel.supportedEfforts?: readonly string[]`。
**文件**：`src/upstream.ts` — `fetchModels()` 从上游 `reasoning.supportedEfforts` 提取该字段并随模型对象下传。

**文件**：`src/adapter.ts` — 用 `resolveEffortLevels()` + `buildThinkingLevelMap()` 替代原先全局的 `THINKING_LEVEL_MAP` 常量，
在 `toPiModel()` 里为每个模型生成**专属**的 `thinkingLevelMap`。

解析规则（避免误删）：

1. 模型声明了 `supportedEfforts`（如 `hy3-x` 返回 `["low","high"]`）→ 仅暴露 `Off` + 声明档位。
2. `id` 以 `hy3` 开头（CLI 入口未声明，但同族 hy3-x 已证明只有 `low/high`）→ 固定 `Off/Low/High`，不暴露无效的 `medium`。
3. 模型未声明支持集合（如 `deepseek-v4-*`）→ 保留**完整通用档位** `Off/Low/Medium/High`，`medium` 可正常选择、不被裁剪。

```ts
function resolveEffortLevels(info: WorkBuddyModelInfo): readonly string[] {
  if (Array.isArray(info.supportedEfforts) && info.supportedEfforts.length > 0) {
    const set = new Set(info.supportedEfforts)
    const levels: string[] = ['off']
    for (const level of ['low', 'medium', 'high']) if (set.has(level)) levels.push(level)
    return levels
  }
  if (info.id.startsWith('hy3')) return ['off', 'low', 'high']
  return ['off', 'low', 'medium', 'high']
}
```

> 实证（`getSupportedThinkingLevels`）：
> - hy3 / hy3-x → `["off","low","high"]`
> - deepseek-v4-flash / deepseek-v4-pro → `["off","low","medium","high"]`

---

## 3. 构建与部署

源码位于插件 clone 根目录的 `src/`。
构建并覆盖到运行中的 profile：

```powershell
# Node.js 22 可执行文件需在 PATH 中（示例路径，请替换为你本机实际位置）
$env:PATH = "$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2;" + $env:PATH
# 在 clone 根目录
cmd /c "node_modules\.bin\tsdown"
# 覆盖 profile 插件（路径请替换为你 DSH 的 web profile node_modules 位置）
Copy-Item lib\* <DSH_WEB_PROFILE>/node_modules/dsh-workbuddy-connect/lib -Recurse -Force
```

> 注意：`pnpm run build` 在本机因 `ERR_PNPM_IGNORED_BUILDS` 失败，但 `cmd /c "node_modules\.bin\tsdown"` 实际构建成功（退出码 1 为误报）。
> 覆盖后**需重启 DSH（3090）** 加载新 hash（如 `host-heartbeat-BYEATj27.js`）方生效。

---

## 4. 影响边界（重要）

- **本插件只影响 WorkBuddy provider 下的模型**（hy3、hy3-x、deepseek-v4-flash、deepseek-v4-pro、glm、kimi、minimax 等，
  具体以 WB 目录返回为准）。
- **DSH 官方/内置 provider 的模型**（如 `deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`）
  由 DSH 内置的 pi-ai `deepseek` provider 提供，其思考档位由 pi-ai 内置模型目录 `deepseek.json` 决定
  （当前版本 `medium:null`、`low:null`，仅 `Off/High/Max`）。**本插件不触及，也无法修复**该路径的档位。

---

## 5. 已知遗留

- WorkBuddy 上游对非 thinking 模型 / 超长会话会返回 `11115`（context length）。属上游长上下文限制，非代码缺陷；
  建议新开会话处理超长对话。
- 官方 deepseek 模型的 medium/low 档位缺失属 pi-ai 内置目录定义，未予处理（按需求方要求暂不改动）。
