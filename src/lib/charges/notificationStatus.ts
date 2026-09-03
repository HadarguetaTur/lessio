/**
 * Whether the parent will hear about a payment we just recorded.
 *
 * Decided before the action responds, so the toast can be honest about what
 * will happen; the send itself is fire-and-forget afterwards.
 */
export type PaymentNotificationStatus =
  | 'queued'
  | 'disabled'
  | 'no_phone'
  | 'whatsapp_not_connected'

export interface NotificationDecisionInput {
  /**
   * What the dialog's checkbox said. `undefined` means the caller expressed no
   * preference — an API client, or a call site predating the checkbox — and the
   * org default decides instead.
   */
  notifyParent: boolean | undefined
  /** The org default from /settings/whatsapp. */
  orgDefault: boolean
  /** False when the charge has no parent attached. */
  hasParent: boolean
  hasPhone: boolean
  whatsappConnected: boolean
}

/**
 * The whole decision, kept pure so it can be reasoned about and tested without
 * a database.
 *
 * An explicit `notifyParent` always beats the org default in both directions:
 * the setting picks what the box starts as, never what a tutor may choose for
 * an individual payment.
 */
export function decideNotificationStatus({
  notifyParent,
  orgDefault,
  hasParent,
  hasPhone,
  whatsappConnected,
}: NotificationDecisionInput): PaymentNotificationStatus {
  const wanted = notifyParent ?? orgDefault
  if (!wanted || !hasParent) return 'disabled'
  if (!hasPhone) return 'no_phone'
  if (!whatsappConnected) return 'whatsapp_not_connected'
  return 'queued'
}
