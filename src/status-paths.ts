/** Node-free constants and types shared by the Host and browser halves. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const WORKBUDDY_STATUS_PATH = '/plugins/dsh-workbuddy-connect/status'

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
}

/** The JSON document the plugin card renders. */
export type WorkBuddyWebStatus =
  | { status: 'signed-out' }
  | {
    status: 'signed-in'
    nickname?: string
    domain?: string
    source?: 'desktop' | 'dsh'
    expiresAt?: number
    credits?: WorkBuddyWebCredits
    creditsError?: string
    models?: readonly WorkBuddyWebModel[]
  }
  | { status: 'error'; message: string }
