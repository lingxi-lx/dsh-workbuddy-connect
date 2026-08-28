/**
 * Local secret store for the plugin's own keys.
 *
 * DSH does not expose a `ctx.credentials` service in this runtime, so we mirror
 * the approach used by the official `dsh-pocket` plugin: persist the secret to
 * a 0600 file under `$DSH_HOME/<plugin>/` (cross-restart, process-local, no
 * third-party service). The card's "Save" button calls the set-key endpoint,
 * which writes here; search reads here first, then falls back to the env.
 *
 * @module dsh-workbuddy-connect/key-store
 */

import { homedir } from 'node:os'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WorkBuddySearchMode } from './status-paths.ts'

/** Relative path under $DSH_HOME where the TinyFish key lives. */
const KEY_REL = join('dsh-workbuddy-connect', 'tinyfish-key')

/** Relative path under $DSH_HOME where the web-search engine mode lives. */
const MODE_REL = join('dsh-workbuddy-connect', 'search-mode')

/** Valid web-search engine modes. */
const VALID_MODES: readonly WorkBuddySearchMode[] = ['auto', 'tinyfish-global', 'system-global']

/** Absolute path of the persisted key file. */
function keyPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), KEY_REL)
}

/** Read the persisted TinyFish key, or `undefined` if unset / unreadable. */
export function readTinyFishKey(): string | undefined {
  try {
    const v = readFileSync(keyPath(), 'utf8').trim()
    return v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}

/** Persist the TinyFish key with owner-only (0600) permissions. */
export function writeTinyFishKey(key: string): void {
  const p = keyPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, key, { mode: 0o600 })
}

/** Remove the persisted key (clear/revoke). */
export function clearTinyFishKey(): void {
  try {
    rmSync(keyPath(), { force: true })
  } catch { /* already gone */ }
}

/** Absolute path of the persisted search-mode file. */
function modePath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), MODE_REL)
}

/** Read the web-search engine mode, defaulting to `auto` when unset / invalid. */
export function readSearchMode(): WorkBuddySearchMode {
  try {
    const v = readFileSync(modePath(), 'utf8').trim()
    if ((VALID_MODES as readonly string[]).includes(v)) return v as WorkBuddySearchMode
  } catch { /* absent */ }
  return 'auto'
}

/** Persist the web-search engine mode (owner-only, 0600). */
export function writeSearchMode(mode: WorkBuddySearchMode): void {
  if (!(VALID_MODES as readonly string[]).includes(mode)) return
  const p = modePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, mode, { mode: 0o600 })
}
