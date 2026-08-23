# dsh-workbuddy-connect 插件修改清单

仅列对插件源码的改动，不含背景、过程与排查记录。

## src/upstream.ts

### 1. `WorkBuddyUpstreamModel` 新增字段
```ts
/** The explicit set of reasoning-effort levels the model exposes, when the
 *  upstream declares it (e.g. hy3-x: ["low","high"]). */
supportedEfforts?: readonly string[]
```

### 2. `fetchModels()` 提取 `supportedEfforts`
从上游模型对象的 `reasoning.supportedEfforts` 读取字符串数组，非空时随模型下传：
```ts
const supportedEfforts = Array.isArray(reasoningObj?.['supportedEfforts'])
  ? (reasoningObj['supportedEfforts'] as unknown[]).filter((v): v is string => typeof v === 'string')
  : undefined
// ...
...supportedEfforts === undefined || supportedEfforts.length === 0 ? {} : { supportedEfforts },
```

### 3. 新增 `normalizeRoles()` 并由 `prepareChatBody()` 调用
将消息体中 `role === 'developer'` 改写为 `'system'`。
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

### 4. 改写 `normalizeReasoning()`
删除嵌套的 `reasoning` 字段，仅保留扁平 `reasoning_effort` 透传：
```ts
function normalizeReasoning(obj: Record<string, unknown>): void {
  delete obj['reasoning']
}
```

### 5. `prepareChatBody()` 调用顺序
```ts
obj['stream'] = true
normalizeToolChoice(obj)
normalizeReasoning(obj)
normalizeRoles(obj)
```

---

## src/adapter.ts

### 6. 移除全局 `THINKING_LEVEL_MAP` 常量

### 7. 新增 `resolveEffortLevels(info)`
按模型解析实际支持的思考档位：
- 声明了 `supportedEfforts` → `Off` + 声明档位；
- `id` 以 `hy3` 开头 → `Off / Low / High`；
- 其余（如 `deepseek-v4-*`）→ `Off / Low / Medium / High`。

### 8. 新增 `buildThinkingLevelMap(info)`
依据 `resolveEffortLevels` 结果为每个模型生成专属 `thinkingLevelMap`
（支持的档位映射到自身，不支持的为 `null`；`minimal`/`xhigh`/`max` 恒为 `null`）。

### 9. `toPiModel()` 改用按模型构建的档位
```ts
...reasoningCapable
  ? { reasoning: true, thinkingLevelMap: buildThinkingLevelMap(info) }
  : {},
```
