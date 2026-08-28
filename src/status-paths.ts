/** Node-free constants and types shared by the Host and browser halves. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const WORKBUDDY_STATUS_PATH = '/plugins/dsh-workbuddy-connect/status'

/** Plugin-owned endpoint that persists the TinyFish API key into DSH's official
 *  local credential store (`ctx.credentials`), consumed by the plugin card. */
export const WORKBUDDY_SET_KEY_PATH = '/plugins/dsh-workbuddy-connect/set-tinyfish-key'

/** Plugin-owned endpoint that persists the web-search engine mode, consumed by the card. */
export const WORKBUDDY_SET_MODE_PATH = '/plugins/dsh-workbuddy-connect/set-search-mode'

/** Plugin-owned endpoint that re-fetches the model catalog from the upstream,
 *  consumed by the card's Refresh button. */
export const WORKBUDDY_REFRESH_PATH = '/plugins/dsh-workbuddy-connect/refresh'

/** Valid web-search engine modes chosen on the plugin card. */
export type WorkBuddySearchMode = 'auto' | 'tinyfish-global' | 'system-global'

/** One billing package and its remaining credit. */
export interface WorkBuddyWebCreditAccount {
  packageName: string
  remain: number
  size: number
}

/** Aggregated credit answer rendered by the plugin card. */
export interface WorkBuddyWebCredits {
  total: number
  accounts: readonly WorkBuddyWebCreditAccount[]
}

/** One model and its credit multiplier / default reasoning effort, for the card. */
export interface WorkBuddyWebModel {
  id: string
  name: string
  /** Credit multiplier as the upstream spells it, e.g. "x0.00 credits". */
  credits?: string
  /** Localized model description. */
  descriptionZh?: string
  /** Default reasoning effort, e.g. "high" / "medium". */
  reasoningEffort?: string
  /** Whether the model accepts image input; `false` means text-only. */
  supportsVision: boolean
}

/** The JSON document the plugin card renders. */
export type WorkBuddyWebStatus =
  | { status: 'signed-out'; tinyfishKeyConfigured?: boolean }
  | {
    status: 'signed-in'
    nickname?: string
    domain?: string
    source?: 'desktop' | 'dsh'
    expiresAt?: number
    credits?: WorkBuddyWebCredits
    creditsError?: string
    models?: readonly WorkBuddyWebModel[]
    tinyfishKeyConfigured?: boolean
    /** Selected web-search engine mode; drives which provider is used per request. */
    searchMode?: WorkBuddySearchMode
  }
  | { status: 'error'; message: string; tinyfishKeyConfigured?: boolean }

/** Result of a manual model-catalog refresh, echoed to the card. */
export type WorkBuddyRefreshResult =
  | { ok: true; modelCount: number; modelIds: readonly string[] }
  | { ok: false; error: string }
