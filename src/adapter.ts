/**
 * The `workbuddy` pi-ai provider: one loopback-backed adapter registered
 * into the Harness LLM seam, assembled from public `dsh-llm-pi-ai`
 * extension points the way `dsh-codex-connect` assembles its Codex route.
 *
 * @module dsh-workbuddy-connect/adapter
 */

import { createProvider } from '@earendil-works/pi-ai'
import type { Api, AuthContext, CredentialStore, Model, Provider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { WorkBuddyCredentialStore } from './auth.ts'
import type { WorkBuddyCatalog, WorkBuddyModelInfo } from './catalog.ts'
import type { WorkBuddyShim } from './shim.ts'
import { isKnownMultimodalModel } from './upstream.ts'

/** Provider route this bundle owns. */
export const WORKBUDDY_PROVIDER = 'workbuddy'

/** Provider idle ceiling while one stream read is outstanding. */
export const WORKBUDDY_STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * Image-request budgets at the dsh-llm-pi-ai defaults; the profile type made
 * them required in 0.1.1-rc.2. Hy3 (and other multimodal routes) now advertise
 * image input, so these bounds apply to picture attachments on those models.
 */
const REQUEST_IMAGE_BUDGETS = {
  maxRequestImageBytes: 20_971_520,
  requestImagePixelBudget: 4_194_304,
  requestImageMaxBytes: 1_048_576,
} as const

/**
 * Inert pi-ai auth plane. The workbuddy route authenticates only through the
 * shim shared secret resolved per request by `resolveApiKey`, so pi-ai's own
 * credential lifecycle and ambient discovery must never manufacture a
 * credential for it. `PiAiAdapterOptions.auth` is required since 0.1.1-rc.2;
 * every ambient question here answers "nothing stored, nothing set".
 */
const INERT_AUTH: { credentials: CredentialStore; authContext: AuthContext } = {
  credentials: {
    async read() { return undefined },
    async list() { return [] },
    async modify() {
      throw new Error('dsh-workbuddy-connect: the workbuddy route has no pi-ai credential lifecycle')
    },
    async delete() {},
  },
  authContext: {
    async env() { return undefined },
    async fileExists() { return false },
  },
}

/** No per-token pricing is knowable for a subscription quota; report zero. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const

/** DSH thinking levels the WorkBuddy upstream never speaks. */
const UNSUPPORTED_THINKING_LEVELS: ReadonlySet<string> = new Set(['minimal', 'xhigh'])

/**
 * Resolve the set of reasoning-effort levels one model actually offers.
 *
 * - A model that declares `supportedEfforts` (e.g. hy3-x: `["low","high"]`)
 *   uses exactly those.
 * - The hy3 family declares none on the CLI entry, but hy3-x does, so hy3 is
 *   pinned to `["off","low","high","max"]`. `max` was verified against the
 *   WorkBuddy upstream (2026-08-23): it emits real `reasoning_content` and
 *   is heavier than the API `high` tier, which matches what the desktop UI's
 *   "high" selection drives. `medium` stays excluded because the upstream
 *   silently ignores it for hy3.
 * - A model with no declared set (e.g. deepseek-v4-*) keeps the full generic
 *   set including `medium`, so its levels stay selectable and are not clipped.
 */
function resolveEffortLevels(info: WorkBuddyModelInfo): readonly string[] {
  if (Array.isArray(info.supportedEfforts) && info.supportedEfforts.length > 0) {
    const set = new Set(info.supportedEfforts)
    const levels: string[] = ['off']
    for (const level of ['low', 'medium', 'high']) if (set.has(level)) levels.push(level)
    return levels
  }
  if (info.id.startsWith('hy3')) return ['off', 'low', 'high', 'max']
  return ['off', 'low', 'medium', 'high']
}

/** Build the per-model `thinkingLevelMap`: supported levels map to themselves, unsupported to `null`. */
function buildThinkingLevelMap(info: WorkBuddyModelInfo): Record<string, string | null> {
  const supported = new Set(resolveEffortLevels(info))
  const map: Record<string, string | null> = {
    off: supported.has('off') ? 'off' : null,
    minimal: null,
    low: supported.has('low') ? 'low' : null,
    medium: supported.has('medium') ? 'medium' : null,
    high: supported.has('high') ? 'high' : null,
    xhigh: null,
    // `max` is supported by the WorkBuddy upstream for hy3 (verified 2026-08-23).
    max: supported.has('max') ? 'max' : null,
  }
  for (const level of UNSUPPORTED_THINKING_LEVELS) map[level] = null
  return map
}

/** Constructor dependencies. */
export interface WorkBuddyAdapterOptions {
  shim: WorkBuddyShim
  store: WorkBuddyCredentialStore
  catalog: WorkBuddyCatalog
  /** Resolve the durable attachment service at request time, when present. */
  resolveAttachments?: () => AttachmentStore | undefined
}

/** What {@link createWorkBuddyAdapter} hands back. */
export interface WorkBuddyAdapter {
  adapter: PiAiAdapter
  /** Rebuild the adapter's provider snapshot; call after a catalog update. */
  invalidate: () => void
}

/** Build one pi-ai model descriptor pointing at the loopback shim. */
function toPiModel(info: WorkBuddyModelInfo, baseUrl: string): Model<Api> {
  const reasoningCapable = info.supportsReasoning || info.reasoningEffort !== undefined
  // Multimodal models (e.g. hy3) must advertise image input so DSH lets the
  // user attach pictures. The WorkBuddy catalog rarely exposes this flag, so
  // prefer the explicit `supportsVision` flag set by upstream.ts, then fall
  // back to the shared `isKnownMultimodalModel` heuristic as a second guard.
  // This double layer is what keeps a model from silently regressing to
  // text-only after the dynamic catalog overwrites the fallback list.
  const supportsVision = info.supportsVision === true || isKnownMultimodalModel(info.id)
  const input = supportsVision ? ['image', 'text'] : ['text']
  return {
    id: info.id,
    name: info.name,
    api: 'openai-completions',
    provider: WORKBUDDY_PROVIDER,
    baseUrl,
    input,
    cost: NO_COST,
    contextWindow: info.contextWindow,
    maxTokens: info.maxTokens,
    // P1: expose the WorkBuddy reasoning effort as a DSH thinking-level
    // selector. Each model advertises only the levels it actually supports
    // (hy3: Off/Low/High; deepseek-v4-*: Off/Low/Medium/High), so `medium`
    // stays selectable for models that honor it and is hidden for those that
    // do not.
    ...reasoningCapable ? { reasoning: true, thinkingLevelMap: buildThinkingLevelMap(info) } : {},
  } as unknown as Model<Api>
}

/**
 * Assemble the adapter. The provider's `getModels` reads the live catalog,
 * and every model's `baseUrl` is re-resolved per read so the shim's
 * ephemeral port applies from the first snapshot after startup.
 */
export function createWorkBuddyAdapter(options: WorkBuddyAdapterOptions): WorkBuddyAdapter {
  const { shim, store, catalog, resolveAttachments } = options

  const buildModels = (): Model<Api>[] => {
    // The OpenAI SDK pi-ai drives appends `/chat/completions` to baseURL,
    // so the shim's routes line up with the `/v1` prefix in place.
    const baseUrl = `${shim.baseUrl()}/v1`
    return catalog.current().map(info => toPiModel(info, baseUrl))
  }

  const base = createProvider({
    id: WORKBUDDY_PROVIDER,
    name: 'WorkBuddy',
    auth: {
      apiKey: {
        name: 'WorkBuddy OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'WorkBuddy' }
        },
      },
    },
    models: buildModels(),
    api: openAICompletionsApi(),
  })

  // `getModels` is delegated to a live read (the reuse-catalog pattern from
  // dsh-llm-pi-ai): stream dispatch still runs through the constructed
  // provider, while the catalog answer tracks the upstream refresh.
  const provider: Provider = { ...base, getModels: () => buildModels() }

  const profile: ResolvedPiAiProviderProfile = {
    provider: WORKBUDDY_PROVIDER,
    displayName: 'WorkBuddy',
    streamIdleTimeoutMs: WORKBUDDY_STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-workbuddy-connect retryPolicy'),
    configuredMaxTokens: new Map(),
    ...REQUEST_IMAGE_BUDGETS,
    piProvider: provider,
  }

  let profiles = new Map<string, ResolvedPiAiProviderProfile>([[WORKBUDDY_PROVIDER, profile]])

  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    auth: INERT_AUTH,
    // Resolve the shim's per-process shared secret as the OpenAI apiKey so
    // pi-ai sends it as `Authorization: Bearer <shared-secret>`. The shim
    // validates this before forwarding and resolves the real WorkBuddy token
    // itself via the store, so the secret never reaches upstream.
    resolveApiKey: async () => shim.token(),
    ...resolveAttachments === undefined ? {} : { resolveAttachments },
  })

  return {
    adapter,
    invalidate: () => {
      profiles = new Map<string, ResolvedPiAiProviderProfile>([[WORKBUDDY_PROVIDER, profile]])
    },
  }
}
