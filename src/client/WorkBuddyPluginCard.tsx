/** WorkBuddy status card contributed to Harness Plugin configuration. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { WORKBUDDY_STATUS_PATH, WORKBUDDY_SET_KEY_PATH, WORKBUDDY_SET_MODE_PATH, WORKBUDDY_REFRESH_PATH } from '../status-paths.ts'
import type { WorkBuddySearchMode } from '../status-paths.ts'
import type { WorkBuddyWebStatus } from '../status-paths.ts'
import type { WorkBuddyRefreshResult } from '../status-paths.ts'
import type { WorkBuddySettingsKey } from './locales.ts'

/** Localized copy injected by the browser-plugin registration. */
export interface WorkBuddyPluginCardInjected {
  t: (key: WorkBuddySettingsKey, params?: Record<string, unknown>) => string
}

/** Props delivered by the Plugin configuration item slot. */
export type WorkBuddyPluginCardProps =
  PropsRuntime<'settings.plugin.item'>
  & Partial<WorkBuddyPluginCardInjected>

const POLL_INTERVAL_MS = 60_000

/** Password-mode placeholder shown in the API-Key field when a key is already saved. */
const KEY_MASK = '\u2022'.repeat(20)

// ---------- Card chrome (matches the official PluginCard `._card` / `._cardOpen`) ----------
const cardStyle: CSSProperties = {
  overflow: 'hidden',
  listStyle: 'none',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-3)',
  transition: 'border-color .16s, background .16s',
}
const cardOpenStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2)',
  borderColor: 'var(--dsw-alias-label-dimmed)',
}
const headerStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  border: 0,
  borderRadius: 12,
  padding: '14px 16px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}
const headTextStyle: CSSProperties = { display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column', gap: 4 }
const nameStyle: CSSProperties = { fontSize: 15, lineHeight: 1.4, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
const descriptionStyle: CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' }
const chevronStyle: CSSProperties = { flex: 'none', fontSize: 18, lineHeight: 1, color: 'var(--dsw-alias-label-tertiary)', transition: 'transform .16s' }
const cardBodyStyle: CSSProperties = { borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '0 16px 8px' }

// ---------- Field primitives (matches the official `._field` / `._input` / `._hint` / `._footer`) ----------
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0' }
const fieldHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }
const fieldLabelStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
}
const fieldInputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-3)',
  height: 34,
  font: 'inherit',
  color: 'var(--dsw-alias-label-primary)',
  borderRadius: 8,
  padding: '0 12px',
  fontSize: 13,
  lineHeight: 1.5,
  outline: 'none',
}
const fieldHintStyle: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.5 }
const sectionDividerStyle: CSSProperties = { borderTop: '1px solid var(--dsw-alias-border-l2)' }
const badgeStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  fontWeight: 500,
  lineHeight: '17px',
  flex: 'none',
}
const footerStyle: CSSProperties = {
  borderTop: '1px solid var(--dsw-alias-border-l2)',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 8,
  padding: '12px 0',
}
const saveButtonStyle: CSSProperties = {
  appearance: 'none',
  font: 'inherit',
  cursor: 'pointer',
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '5px 14px',
  fontSize: 13,
  lineHeight: 1.5,
  background: 'var(--dsw-alias-label-primary)',
  color: 'var(--dsw-alias-bg-layer-1)',
}
// Matches the official PluginCard "放弃修改" (discard) button: ghost fill,
// bordered, secondary text.
const secondaryButtonStyle: CSSProperties = {
  appearance: 'none',
  font: 'inherit',
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  padding: '5px 14px',
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-secondary)',
}
// Engine-mode radio group (shown only when a TinyFish key is configured).
const modeGroupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }
const modeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
}
const modeTextStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
const modeTitleStyle: CSSProperties = { fontSize: 13, lineHeight: 1.5, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const modeDescStyle: CSSProperties = { fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' }
const modeInputStyle: CSSProperties = { flex: 'none', marginTop: 1, width: 16, height: 16, accentColor: 'var(--dsw-alias-label-primary)', cursor: 'pointer' }
const refreshButtonStyle: CSSProperties = {
  appearance: 'none',
  font: 'inherit',
  cursor: 'pointer',
  background: 'transparent',
  border: 0,
  padding: 0,
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: 1.5,
}

// ---------- Account / credits / models ----------
const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-primary)' }
const totalValueStyle: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.5 }
const errorStyle: CSSProperties = { ...fieldHintStyle, color: 'var(--dsw-alias-state-error-primary)' }
const successStyle: CSSProperties = { ...fieldHintStyle, color: 'var(--dsw-alias-state-success-primary, #22a06b)' }
const modelsTableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const modelRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' }
const modelNameStyle: CSSProperties = { flex: '0 0 auto', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const modelMetaStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }
const modelCreditsStyle: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums' }
const modelEffortStyle: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontVariantNumeric: 'tabular-nums' }

function dotStyle(status: WorkBuddyWebStatus['status']): CSSProperties {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto', background: color }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value)
}

/** Normalize a credits string like "x0.00 credits" into "0.00x". */
function formatCredits(credits: string | undefined): string {
  if (credits === undefined) return ''
  const match = /x(\d+(?:\.\d+)?)/.exec(credits)
  return match === null ? credits : `${match[1]}x`
}

/** Localized label for a WorkBuddy reasoning effort. */
function effortLabel(effort: string | undefined, t: WorkBuddyPluginCardInjected['t']): string {
  switch (effort) {
    case 'off': return t('effortOff')
    case 'low': return t('effortLow')
    case 'medium': return t('effortMedium')
    case 'high': return t('effortHigh')
    default: return effort ?? ''
  }
}

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

/** Render WorkBuddy sign-in state, credit, web-search key, and models as one expandable card. */
export function WorkBuddyPluginCard({ t }: WorkBuddyPluginCardProps) {
  if (t === undefined) throw new Error('WorkBuddy plugin card requires its translation function')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<WorkBuddyWebStatus>({ status: 'signed-out' })
  const [busy, setBusy] = useState(false)
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyInputDirty, setKeyInputDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [searchMode, setSearchMode] = useState<WorkBuddySearchMode>('auto')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(WORKBUDDY_STATUS_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (mounted.current && signal?.aborted !== true) {
        const s = value as WorkBuddyWebStatus
        setStatus(s)
        setKeyConfigured(s.tinyfishKeyConfigured === true)
        setKeyInputDirty(false)
        if (s.searchMode !== undefined) setSearchMode(s.searchMode)
      }
    } catch (error: unknown) {
      if (mounted.current && signal?.aborted !== true) {
        setStatus({ status: 'error', message: error instanceof Error ? error.message : t('requestFailed') })
      }
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort() }
  }, [open, refresh])

  useEffect(() => {
    if (!open || status.status !== 'signed-in') return
    const controller = new AbortController()
    const timer = window.setInterval(() => { void refresh(controller.signal) }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [open, refresh, status.status])

  const manualRefresh = async (): Promise<void> => {
    setBusy(true)
    setSaveMsg(null)
    try {
      // 1) Ask the host to re-fetch the upstream catalog and swap it in, so
      //    new models appear in the card AND the model selector immediately.
      const response = await fetch(WORKBUDDY_REFRESH_PATH, {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      const result: WorkBuddyRefreshResult | null = await response.json().catch(() => null)
      if (response.ok && result?.ok === true) {
        setSaveMsg({ type: 'ok', text: t('refreshDone', { count: String(result.modelCount) }) })
      } else {
        const detail = result?.ok === false ? result.error : `HTTP ${response.status}`
        setSaveMsg({ type: 'err', text: t('refreshFailed', { message: detail }) })
      }
    } catch (error: unknown) {
      setSaveMsg({ type: 'err', text: t('refreshFailed', { message: error instanceof Error ? error.message : t('requestFailed') }) })
    } finally {
      // 2) Re-read status so the card shows the (possibly new) model list.
      await refresh()
      if (mounted.current) setBusy(false)
    }
  }

  const saveKey = async (): Promise<void> => {
    const key = keyInput.trim()
    if (key.length === 0 || key === KEY_MASK) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const response = await fetch(WORKBUDDY_SET_KEY_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ key }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error ? String(detail.error) : `HTTP ${response.status}`)
      }
      // Never keep the secret in the DOM: drop the real value, the field will
      // fall back to the password-mask now that the store reports "configured".
      setKeyInput('')
      setKeyInputDirty(false)
      setKeyConfigured(true)
      setSaveMsg({ type: 'ok', text: t('keySaved') })
      void refresh()
    } catch (error: unknown) {
      setSaveMsg({ type: 'err', text: error instanceof Error ? error.message : t('keySaveFailed') })
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const manifestMode = async (mode: WorkBuddySearchMode): Promise<void> => {
    setSearchMode(mode)
    try {
      const response = await fetch(WORKBUDDY_SET_MODE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error ? String(detail.error) : `HTTP ${response.status}`)
      }
    } catch (error: unknown) {
      setSaveMsg({ type: 'err', text: error instanceof Error ? error.message : t('keySaveFailed') })
    }
  }

  const title = t('title')
  const label = status.status === 'signed-in'
    ? status.nickname === undefined ? t('signedInAs', { nickname: '' }).replace(/[:：]\s*$/, '') : t('signedInAs', { nickname: status.nickname })
    : status.status === 'error'
      ? t('requestFailed')
      : t('signedOut')

  // The masked placeholder only shows when a key is already saved AND the user
  // hasn't started typing a replacement.
  const displayKey = keyConfigured && !keyInputDirty ? KEY_MASK : keyInput
  const canSave = keyInputDirty && keyInput.trim().length > 0 && keyInput !== KEY_MASK

  return (
    <li style={{ ...cardStyle, ...(open ? cardOpenStyle : null) }}>
      <button
        type="button"
        style={headerStyle}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span style={headTextStyle}>
          <span style={nameStyle}>{title}</span>
          <span style={descriptionStyle}>{t('intro')}</span>
        </span>
        <span aria-hidden="true" style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </button>
      {open
        ? <div style={cardBodyStyle}>
            {/* --- Account --- */}
            <div style={fieldStyle}>
              <div style={fieldHeadStyle}>
                <span style={fieldLabelStyle}>{t('accountHeading')}</span>
                <button
                  type="button"
                  style={refreshButtonStyle}
                  disabled={busy}
                  onClick={() => { void manualRefresh() }}
                >
                  {busy ? t('refreshing') : t('refresh')}
                </button>
              </div>
              <div style={statusStyle} role="status">
                <span aria-hidden="true" style={dotStyle(status.status)} />
                <span>{label}</span>
              </div>
              {status.status === 'signed-in' && status.expiresAt !== undefined
                ? <p style={fieldHintStyle}>{t('accessTokenExpires', { time: formatTime(status.expiresAt) })}</p>
                : null}
              {status.status === 'signed-out'
                ? <p style={fieldHintStyle}>{t('signedOutHint')}</p>
                : null}
              {status.status === 'error'
                ? <p style={errorStyle}>{status.message}</p>
                : null}
            </div>

            {/* --- Remaining credit --- */}
            {status.status === 'signed-in'
              ? <div style={sectionDividerStyle}>
                  <div style={fieldStyle}>
                    <div style={fieldHeadStyle}>
                      <span style={fieldLabelStyle}>{t('creditsHeading')}</span>
                      <span style={totalValueStyle}>
                        {status.credits === undefined ? '' : t('creditsTotal', { total: formatNumber(status.credits.total) })}
                      </span>
                    </div>
                    {status.creditsError === undefined
                      ? null
                      : <p style={errorStyle}>{t('creditsError', { message: status.creditsError })}</p>}
                  </div>
                </div>
              : null}

            {/* --- Web search (API Key) --- */}
            <div style={sectionDividerStyle}>
              <div style={fieldStyle}>
                <div style={fieldHeadStyle}>
                  <span style={fieldLabelStyle}>{t('tinyfishKeyLabel')}</span>
                  <span style={badgeStyle}>{keyConfigured ? t('keyConfigured') : t('keyNotConfigured')}</span>
                </div>
                <input
                  type="password"
                  value={displayKey}
                  placeholder={t('tinyfishKeyPlaceholder')}
                  aria-label={t('tinyfishKeyLabel')}
                  onChange={(e) => {
                    setKeyInput(e.target.value)
                    setKeyInputDirty(true)
                    setSaveMsg(null)
                  }}
                  style={fieldInputStyle}
                />
                <p style={fieldHintStyle}>
                  {keyConfigured ? t('keyConfiguredHint') : t('keyNotConfiguredHint')}
                </p>
                {keyConfigured
                  ? (
                    <div style={modeGroupStyle}>
                      <span style={fieldLabelStyle}>{t('engineModeHeading')}</span>
                      {(['auto', 'tinyfish-global', 'system-global'] as const).map((mode) => {
                        const titleKey = mode === 'auto' ? 'modeAutoTitle' : mode === 'tinyfish-global' ? 'modeTinyFishTitle' : 'modeSystemTitle'
                        const descKey = mode === 'auto' ? 'modeAutoDesc' : mode === 'tinyfish-global' ? 'modeTinyFishDesc' : 'modeSystemDesc'
                        return (
                          <label key={mode} style={modeRowStyle}>
                            <span style={modeTextStyle}>
                              <span style={modeTitleStyle}>{t(titleKey)}</span>
                              <span style={modeDescStyle}>{t(descKey)}</span>
                            </span>
                            <input
                              type="radio"
                              name="workbuddy-search-mode"
                              checked={searchMode === mode}
                              onChange={() => { void manifestMode(mode) }}
                              style={modeInputStyle}
                            />
                          </label>
                        )
                      })}
                    </div>
                  )
                  : null}
                {saveMsg === null
                  ? null
                  : <p style={saveMsg.type === 'ok' ? successStyle : errorStyle}>{saveMsg.text}</p>}
              </div>
              <div style={footerStyle}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => { window.open('https://agent.tinyfish.ai/api-keys', '_blank', 'noopener') }}
                >
                  {t('getTinyFishKey')}
                </button>
                <button
                  type="button"
                  style={saveButtonStyle}
                  disabled={saving || !canSave}
                  onClick={() => { void saveKey() }}
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            </div>

            {/* --- Models & credit multiplier --- */}
            {status.status === 'signed-in'
              ? <div style={sectionDividerStyle}>
                  <div style={fieldStyle}>
                    <div style={fieldHeadStyle}>
                      <span style={fieldLabelStyle}>{t('modelsHeading')}</span>
                    </div>
                    {status.models === undefined || status.models.length === 0
                      ? <p style={fieldHintStyle}>{t('noModelsHint')}</p>
                      : (
                        <div style={modelsTableStyle}>
                          {status.models.map(model => (
                            <div key={model.id} style={modelRowStyle}>
                              <span style={modelNameStyle}>{model.name}</span>
                              <span style={modelMetaStyle}>
                                {model.credits === undefined ? null
                                  : <span style={modelCreditsStyle}>{formatCredits(model.credits)}</span>}
                                {model.reasoningEffort === undefined ? null
                                  : <span style={modelEffortStyle}>{t('reasoningLabel')} {effortLabel(model.reasoningEffort, t)}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
              : null}
          </div>
        : null}
    </li>
  )
}