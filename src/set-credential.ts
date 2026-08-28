/**
 * Endpoint that persists the TinyFish API key into the plugin's own local
 * secret store (a 0600 file under `$DSH_HOME/dsh-workbuddy-connect/`, mirroring
 * the `dsh-pocket` plugin's approach to persisting secrets without a third-party
 * credential service). The browser card's "Save" button POSTs here; the key is
 * never echoed back.
 *
 * Mount: POST /plugins/dsh-workbuddy-connect/set-tinyfish-key
 *        body: { key: "sk-tinyfish-..." }
 *
 * @module dsh-workbuddy-connect/set-credential
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { WORKBUDDY_SET_KEY_PATH } from './status-paths.ts'
import { readTinyFishKey, writeTinyFishKey } from './key-store.ts'

/** Public path of the set-key endpoint (also re-exported for host callers). */
export const SET_TINYFISH_KEY_PATH = WORKBUDDY_SET_KEY_PATH

export function registerSetTinyFishKeyRoute(webCtx: Context): void {
  webCtx.effect(() => {
    const dispose = webCtx.webServer.register({
      kind: 'exact',
      path: SET_TINYFISH_KEY_PATH,
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
        const key = typeof body.key === 'string' ? body.key.trim() : ''
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'missing key' }))
          return
        }
        try {
          writeTinyFishKey(key)
          // Verify the write round-trips (without echoing the secret back).
          const configured = readTinyFishKey() !== undefined
          webCtx.logger.info('workbuddy-connect: persisted TINYFISH_API_KEY to local key store')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, configured }))
        } catch (e: unknown) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      },
    })
    return () => { dispose() }
  }, 'dsh-workbuddy-connect: set-tinyfish-key route')
}
