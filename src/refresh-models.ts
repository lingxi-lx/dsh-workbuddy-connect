/**
 * Endpoint that re-fetches the WorkBuddy model catalog from the upstream and
 * swaps it into the shared catalog (plus the pi-ai adapter snapshot). The
 * browser card's Refresh button POSTs here, then re-reads `/status` so the
 * model list in the card and the model selector both show the fresh catalog.
 *
 * Mount: POST /plugins/dsh-workbuddy-connect/refresh
 *
 * The adapter's `invalidate` is only constructed once the loopback shim is
 * listening (inside `shim.ready`), so the route resolves it lazily at call
 * time through `getInvalidate` rather than capturing it at plugin load.
 *
 * @module dsh-workbuddy-connect/refresh-models
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WORKBUDDY_REFRESH_PATH } from './status-paths.ts'
import type { WorkBuddyRefreshResult } from './status-paths.ts'
import type { WorkBuddyCredentialStore } from './auth.ts'
import type { WorkBuddyUpstreamClient } from './upstream.ts'
import type { WorkBuddyCatalog } from './catalog.ts'

/** Public path of the refresh endpoint (also re-exported for host callers). */
export const WORKBUDDY_REFRESH_PATH_ALIAS = WORKBUDDY_REFRESH_PATH

/** Constructor dependencies; `getInvalidate` is resolved lazily at call time. */
export interface WorkBuddyRefreshRouteOptions {
  store: WorkBuddyCredentialStore
  client: Pick<WorkBuddyUpstreamClient, 'fetchModels'>
  catalog: WorkBuddyCatalog
  /** Resolve the adapter invalidation callback; undefined until the shim is up. */
  getInvalidate: () => (() => void) | undefined
}

function writeJson(res: ServerResponse, status: number, body: WorkBuddyRefreshResult): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

/**
 * Re-fetch the upstream catalog and swap it in. Returns the refreshed model
 * ids on success, or a classified error. Throws only on programming errors.
 */
export async function refreshWorkBuddyModels(
  deps: WorkBuddyRefreshRouteOptions,
): Promise<WorkBuddyRefreshResult> {
  const credential = await deps.store.current()
  if (credential === undefined) {
    return { ok: false, error: 'not signed in; sign in once in the WorkBuddy desktop app' }
  }
  const models = await deps.client.fetchModels(credential)
  deps.catalog.set([...models])
  deps.getInvalidate()?.()
  return { ok: true, modelCount: models.length, modelIds: models.map(model => model.id) }
}

/** Mount the POST refresh route on an optional webServer context. */
export function registerRefreshModelsRoute(webCtx: Context, deps: WorkBuddyRefreshRouteOptions): void {
  webCtx.effect(() => {
    const dispose = webCtx.webServer.register({
      kind: 'exact',
      path: WORKBUDDY_REFRESH_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'method not allowed' }))
          return
        }
        try {
          writeJson(res, 200, await refreshWorkBuddyModels(deps))
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          webCtx.logger.warn(`workbuddy-connect: manual model refresh failed: ${message}`)
          writeJson(res, 200, { ok: false, error: message })
        }
      },
    })
    return () => { dispose() }
  }, 'dsh-workbuddy-connect: refresh-models route')
}
