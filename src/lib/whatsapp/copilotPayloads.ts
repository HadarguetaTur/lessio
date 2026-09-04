/**
 * Reply payloads for the owner/admin copilot confirmation flow.
 *
 * Namespace: `cp:`
 *
 * Session forms (current) — the proposal's params live in copilot_sessions and
 * the button carries only the row id, so a button can never replay stale
 * params and richer actions never fight WhatsApp's id length limits:
 * - `cp:c:<sessionId>`          confirm the proposal
 * - `cp:x:<sessionId>`          cancel it
 * - `cp:p:<sessionId>:<index>`  pick row <index> from a disambiguation list
 *
 * Legacy forms (still decoded — buttons sent before the session flow shipped
 * may be tapped days later):
 * - `cp:confirm:<action>`
 * - `cp:confirm:<action>:<parentId>`
 * - `cp:cancel`
 */

const PREFIX = 'cp'

/** Session ids are uuids; anything else in that slot is a mangled or forged tap. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CopilotAction =
  | 'send_debt_reminder_all'
  | 'send_debt_reminder_parent'

export type CopilotConfirmPayload =
  | { action: 'confirm'; kind: CopilotAction; parentId?: string }
  | { action: 'cancel' }
  | { action: 'confirm_session'; sessionId: string }
  | { action: 'cancel_session'; sessionId: string }
  | { action: 'pick'; sessionId: string; index: number }

export function encodeCopilotSessionPayload(kind: 'confirm' | 'cancel', sessionId: string): string
export function encodeCopilotSessionPayload(kind: 'pick', sessionId: string, index: number): string
export function encodeCopilotSessionPayload(
  kind: 'confirm' | 'cancel' | 'pick',
  sessionId: string,
  index?: number
): string {
  if (kind === 'pick') return `${PREFIX}:p:${sessionId}:${index}`
  return `${PREFIX}:${kind === 'confirm' ? 'c' : 'x'}:${sessionId}`
}

/**
 * A legacy confirm payload must name its action explicitly — defaulting it
 * would make a forgotten argument silently send every debtor a reminder.
 */
export function encodeCopilotPayload(action: 'cancel'): string
export function encodeCopilotPayload(
  action: 'confirm',
  kind: CopilotAction,
  parentId?: string
): string
export function encodeCopilotPayload(
  action: 'confirm' | 'cancel',
  kind?: CopilotAction,
  parentId?: string
): string {
  if (action === 'cancel' || !kind) return `${PREFIX}:cancel`
  return parentId ? `${PREFIX}:confirm:${kind}:${parentId}` : `${PREFIX}:confirm:${kind}`
}

export function decodeCopilotPayload(replyId: string | undefined): CopilotConfirmPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== PREFIX || parts.length < 2) return null

  // Session forms.
  if (parts[1] === 'c' || parts[1] === 'x') {
    if (parts.length !== 3 || !UUID_RE.test(parts[2])) return null
    return parts[1] === 'c'
      ? { action: 'confirm_session', sessionId: parts[2] }
      : { action: 'cancel_session', sessionId: parts[2] }
  }
  if (parts[1] === 'p') {
    if (parts.length !== 4 || !UUID_RE.test(parts[2])) return null
    const index = Number(parts[3])
    if (!Number.isInteger(index) || index < 0 || String(index) !== parts[3]) return null
    return { action: 'pick', sessionId: parts[2], index }
  }

  // Legacy forms.
  if (parts[1] === 'cancel') return parts.length === 2 ? { action: 'cancel' } : null
  if (parts[1] !== 'confirm' || parts.length < 3) return null

  const kind = parts[2] as CopilotAction | undefined
  if (kind === 'send_debt_reminder_all') {
    return parts.length === 3 ? { action: 'confirm', kind } : null
  }

  if (kind === 'send_debt_reminder_parent') {
    if (parts.length !== 4) return null
    const parentId = parts[3]
    if (!parentId) return null
    return { action: 'confirm', kind, parentId }
  }

  return null
}
