/**
 * Reply payloads for the owner/admin copilot confirmation flow.
 *
 * Namespace: `cp:`
 * - `cp:confirm:<action>`
 * - `cp:confirm:<action>:<parentId>`
 * - `cp:cancel`
 */

const PREFIX = 'cp'

export type CopilotAction =
  | 'send_debt_reminder_all'
  | 'send_debt_reminder_parent'

export type CopilotConfirmPayload =
  | { action: 'confirm'; kind: CopilotAction; parentId?: string }
  | { action: 'cancel' }

/**
 * A confirm payload must name its action explicitly — defaulting it would make
 * a forgotten argument silently send every debtor a reminder.
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
