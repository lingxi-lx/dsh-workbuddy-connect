/**
 * Endpoint that persists the web-search engine mode (auto / tinyfish-global /
 * system-global) into the plugin's own local store — a 0600 file under
 * `$DSH_HOME/dsh-workbuddy-connect/`. The browser card's radio group POSTs
 * here; the mode is never echoed back.
 *
 * Mount: POST /plugins/dsh-workbuddy-connect/set-search-mode
 *        body: { mode: "auto" | "tinyfish-global" | "system-global" }
 *
 * @module dsh-workbuddy-connect/set-search-mode
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WORKBUDDY_SET_MODE_PATH } from './status-paths.ts'
import { writeSearchMode } from './key-store.ts'
import type { WorkBuddySearchMode } from './status-paths.ts'

/** Public path of the set-mode endpoint (also re-exported for host callers). */
export const SET_SEARCH_MODE_PATH = WORKBUDDY_SET_MODE_PATH

const VALID_MODES: readonly WorkBuddySearchMode[] = ['auto', 'tinyfish-global', 'system-global']

export function registerSetSearchModeRoute(webCtx: Context): void {
  webCtx.effect(() => {
    const dispose = webCtx.webServer.register({
      kind: 'exact',
      path: SET_SEARCH_MODE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'method not allowed' }))
          return
        }
        let body: any = {}
        try {
          const buf: string[] = []
          for await (const chunk of req) buf.push(chunk.toString())
          body = JSON.parse(buf.join('') || '{}')
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid json' }))
          return
        }
        const mode = typeof body.mode === 'string' ? body.mode.trim() : ''
        if (!(VALID_MODES as readonly string[]).includes(mode)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid mode' }))
          return
        }
        try {
          writeSearchMode(mode as WorkBuddySearchMode)
          webCtx.logger.info('workbuddy-connect: persisted search mode to local store')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, mode }))
        } catch (e: unknown) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      },
    })
    return () => { dispose() }
  }, 'dsh-workbuddy-connect: set-search-mode route')
}
