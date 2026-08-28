/**
 * WorkBuddy models for DeepSeek Harness, reusing the WorkBuddy desktop
 * app's sign-in. Registers the `workbuddy` provider; streaming, tool calls,
 * compaction, and permissions stay Harness-owned.
 * @module dsh-workbuddy-connect
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment'
import { WorkBuddyCredentialStore } from './auth.ts'
import { WorkBuddyCatalog } from './catalog.ts'
import { createWorkBuddyAdapter, WORKBUDDY_PROVIDER } from './adapter.ts'
import { createWorkBuddyShim } from './shim.ts'
import { WorkBuddyUpstreamClient } from './upstream.ts'
import { registerWorkBuddyStatusRoute } from './web-status.ts'
import { registerSetTinyFishKeyRoute } from './set-credential.ts'
import { readTinyFishKey, readSearchMode } from './key-store.ts'
import { registerSetSearchModeRoute } from './set-search-mode.ts'
import { createTinyFishProvider, createDeepSeekOfficialProvider, TINYFISH_PROVIDER_ID, DEEPSEEK_PROVIDER_ID } from './search-provider.ts'
import { clearHostHeartbeat, writeHostHeartbeat } from './host-heartbeat.ts'

export { WORKBUDDY_PROVIDER, WORKBUDDY_STREAM_IDLE_TIMEOUT_MS, createWorkBuddyAdapter, type WorkBuddyAdapter } from './adapter.ts'
export { createWorkBuddyShim, type WorkBuddyShim } from './shim.ts'
export {
  FALLBACK_WORKBUDDY_MODELS,
  WorkBuddyCatalog,
  type WorkBuddyModelInfo,
} from './catalog.ts'
export {
  defaultDesktopAuthPath,
  parseWorkBuddyAuth,
  WORKBUDDY_AUTH_FILE_ENV,
  WORKBUDDY_AUTH_FILENAME,
  WorkBuddyCredentialStore,
  workbuddyOwnAuthPath,
  type WorkBuddyAuthStatus,
  type WorkBuddyCredential,
} from './auth.ts'
export {
  classifyUpstreamError,
  prepareChatBody,
  regionOf,
  WorkBuddyUpstreamClient,
  type UpstreamErrorKind,
  type WorkBuddyChatResult,
  type WorkBuddyCredits,
  type WorkBuddyRefreshOutcome,
  type WorkBuddyUpstreamModel,
} from './upstream.ts'
export {
  WORKBUDDY_HOST_HEARTBEAT_FILENAME,
  clearHostHeartbeat,
  isHeartbeatProcessAlive,
  processStartTimeMs,
  readHostHeartbeat,
  workbuddyHostHeartbeatPath,
  type WorkBuddyHostHeartbeat,
} from './host-heartbeat.ts'

/** Stable Cordis plugin name. */
export const name = 'llm-workbuddy'

/** The model registry required before the provider can register. */
export const inject = ['llm', 'web']

/** Settings namespace reserved for the future configuration card. */
export const WORKBUDDY_SETTINGS_NS = settingsNamespace('workbuddy')

/** Plugin configuration. */
export interface Config {
  /** Explicit WorkBuddy desktop auth-file path, overriding env and platform defaults. */
  authFile?: string
}

export const Config: z<Config> = z.object({
  authFile: z.string().description('WorkBuddy desktop auth file (defaults to the app\'s own location)'),
})

/**
 * Start the loopback endpoint, register the `workbuddy` provider, and
 * refresh the model catalog from the upstream once credentials allow it.
 * The static fallback catalog serves from the first moment, so an offline
 * upstream never leaves the provider empty.
 */
export function apply(ctx: Context, config: Config): void {
  const client = new WorkBuddyUpstreamClient()
  const store = new WorkBuddyCredentialStore({
    ...config.authFile === undefined ? {} : { desktopPath: config.authFile },
    refresh: credential => client.refreshToken(credential),
  })
  const catalog = new WorkBuddyCatalog()
  const shim = createWorkBuddyShim({ store, client, catalog, logger: ctx.logger })

  // Web search providers. Two real providers are registered; the active one
  // is selected by ctx.web.searchProviderId, which we flip on the `agent/request`
  // event (the moment a model is selected/switched for a conversation):
  //   - workbuddy-tinyfish  -> active when the model provider is `workbuddy`
  //   - deepseek-official   -> active otherwise (uses DeepSeek web_search_20250305)
  const resolveSearchKeys = async (): Promise<{
    tinyfishApiKey?: string
    deepseekApiKey?: string
  }> => {
    const resolveEnv = async (env: string): Promise<string | undefined> => {
      // TINYFISH_API_KEY is read from the plugin's local key store (written by
      // the card's "Save" button and persisted under $DSH_HOME/dsh-workbuddy-connect),
      // then from the process environment. No hardcoded fallback — if it's unset
      // the search provider reports a clear "TINYFISH_API_KEY is not set" error.
      if (env === 'TINYFISH_API_KEY') {
        const stored = readTinyFishKey()
        if (stored) return stored
      }
      return process.env[env] || undefined
    }
    const [tinyfishApiKey, deepseekApiKey] = await Promise.all([
      resolveEnv('TINYFISH_API_KEY'),
      resolveEnv('DEEPSEEK_API_KEY'),
    ])
    return {
      tinyfishApiKey,
      deepseekApiKey,
    }
  }
  // Register both providers on the plugin's own fiber (NOT inside a
  // ctx.inject(['web'], ...) callback — that callback runs on a transient
  // fiber whose effect is torn down after the callback returns, which would
  // unregister the providers). Top-level `inject` already declares 'web', so
  // ctx.web is available here for the whole plugin lifetime.
  const tinyfish = createTinyFishProvider(ctx, resolveSearchKeys)
  const deepseek = createDeepSeekOfficialProvider(ctx, resolveSearchKeys)
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    // Register our TinyFish route (unique id, no first-party clash).
    disposers.push(ctx.web.registerSearchProvider(tinyfish))
    // The `deepseek-official` id is also registered by the first-party
    // dsh-llm-deepseek package. Re-registering it would throw
    // WEB_DUPLICATE_PROVIDER and bring down the whole plugin tree, so we
    // tolerate that and reuse the framework's provider instead.
    try {
      disposers.push(ctx.web.registerSearchProvider(deepseek))
    } catch (e: unknown) {
      ctx.logger.warn(
        `workbuddy-connect: deepseek-official already registered by DSH; reusing it (${e instanceof Error ? e.message : String(e)})`,
      )
    }
    // Default to the official DeepSeek route; the agent/request hook below
    // flips this to workbuddy-tinyfish when a WorkBuddy model is active.
    // Setting it once here guarantees a configuredId exists, so the two
    // available providers never trigger WEB_PROVIDER_AMBIGUOUS.
    if (!ctx.web.searchProviderId) {
      ctx.web.searchProviderId = DEEPSEEK_PROVIDER_ID
      ctx.logger.info(`workbuddy-connect: default web.searchProvider = "${DEEPSEEK_PROVIDER_ID}"`)
    }
    return () => { for (const d of disposers) d() }
  }, 'dsh-workbuddy-connect: web search providers')

  // Flip the search provider at model-selection time. `agent/request` is a
  // Cordis waterfall fired at the start of every conversation turn; its config
  // carries the active model's `provider`. We only set searchProviderId here,
  // never inside search() — search just consumes the already-selected provider.
  //
  // Engine mode (persisted locally) drives which provider is used:
  //   - auto            : WB models -> TinyFish; others -> system search
  //   - tinyfish-global : every model -> TinyFish (falls back to system if no key)
  //   - system-global   : every model -> system search
  // When no TinyFish key is configured, TinyFish can never be selected, so the
  // system (official) search is always used.
  ctx.on('agent/request', async (_payload: unknown, next: () => Promise<{ provider?: string }>) => {
    const config = await next()
    const provider = config?.provider
    const hasKey = readTinyFishKey() !== undefined
    const mode = readSearchMode()
    const wantTinyFish = hasKey && (
      mode === 'tinyfish-global'
      || (mode === 'auto' && provider === WORKBUDDY_PROVIDER)
    )
    const target = wantTinyFish ? TINYFISH_PROVIDER_ID : DEEPSEEK_PROVIDER_ID
    try {
      if (ctx.web.searchProviderId !== target) {
        ctx.web.searchProviderId = target
        ctx.logger.info(`workbuddy-connect: provider "${provider}", mode "${mode}", key ${hasKey} -> web.searchProvider = "${target}"`)
      }
    } catch (e: unknown) {
      ctx.logger.warn(`workbuddy-connect: failed to switch search provider: ${e instanceof Error ? e.message : String(e)}`)
    }
    return config
  })

  // Same-origin status route backing the Plugin-configuration card; the
  // webServer service is optional (a headless profile serves no browser).
  // The credential store is resolved lazily inside the handler (call time),
  // not via a value captured here at plugin-load time.
  ctx.inject(['webServer'], webCtx => registerWorkBuddyStatusRoute(webCtx, { store, client, catalog }))

  // Temporary: persist the TinyFish key into DSH's official credential store.
  // Remove after the key is persisted (see set-credential.ts).
  ctx.inject(['webServer'], webCtx => registerSetTinyFishKeyRoute(webCtx))

  // Persist the web-search engine mode (auto / tinyfish-global / system-global).
  ctx.inject(['webServer'], webCtx => registerSetSearchModeRoute(webCtx))

  // The settings section is what makes the provider visible on the Models
  // settings page (settings.describe joins the provider directory), and it
  // keeps the configured auth-file path live across edits.
  let current = () => config
  installSettingsSection(ctx, WORKBUDDY_SETTINGS_NS, Config, config, {
    setSource(source) { current = source },
    onChange() {
      const next = current().authFile
      store.setDesktopPath(next)
    },
  })

  let stopped = false
  ctx.effect(() => () => {
    stopped = true
    void shim.close()
    void clearHostHeartbeat()
  })

  void shim.ready
    .then(() => {
      if (stopped) return

      let invalidate: (() => void) | undefined
      try {
        // Constructed only once the listener holds a port: the provider's
        // models read the shim origin at construction time.
        const workbuddy = createWorkBuddyAdapter({
          shim,
          store,
          catalog,
          resolveAttachments: () => ctx.get('attachments'),
        })
        invalidate = workbuddy.invalidate

        let releaseAdapter: (() => void) | undefined
        let releaseDirectory: (() => void) | undefined
        try {
          releaseAdapter = ctx.llm.registerAdapter([WORKBUDDY_PROVIDER], workbuddy.adapter)
          releaseDirectory = ctx.llm.registerConfigurableProviders([{
            provider: WORKBUDDY_PROVIDER,
            displayName: 'WorkBuddy',
            settingsNs: WORKBUDDY_SETTINGS_NS,
            settingsPath: [],
            declared: false,
          }])
        } finally {
          if (releaseAdapter === undefined || releaseDirectory === undefined) {
            // Registration threw; release whichever half landed.
            releaseAdapter?.()
            releaseDirectory?.()
          }
        }
        try {
          ctx.effect(() => () => {
            releaseAdapter?.()
            releaseDirectory?.()
          })
        } catch {
          // The plugin was disposed during registration; release immediately —
          // the plugin-level disposer already closed the shim.
          releaseAdapter?.()
          releaseDirectory?.()
        }

        // The host bundle is live: write a heartbeat so the status CLI can
        // report host health without a browser. Cleared on disposal; a stale
        // heartbeat after a crash is detected by PID in the reader.
        void writeHostHeartbeat()
      } catch (error: unknown) {
        ctx.logger.error('dsh-workbuddy-connect: provider registration failed', error)
        return
      }

      void (async () => {
        try {
          const credential = await store.current()
          if (credential === undefined || stopped) return
          const models = await client.fetchModels(credential)
          if (stopped) return
          catalog.set([...models])
          invalidate?.()
        } catch (error: unknown) {
          ctx.logger.warn(
            'dsh-workbuddy-connect: dynamic model catalog unavailable; serving the static fallback list',
            error,
          )
        }
      })()
    })
    .catch((error: unknown) => {
      ctx.logger.error('dsh-workbuddy-connect: loopback endpoint failed to start; provider not registered', error)
    })
}
