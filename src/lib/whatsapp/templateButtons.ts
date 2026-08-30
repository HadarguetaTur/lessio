/**
 * Which buttons each message type carries, and which of them an owner may
 * reword.
 *
 * One declarative map feeds two things that must never disagree: the WhatsApp
 * preview on the settings page, and the editable label fields under it. Adding
 * a button to a flow means adding it here, or the preview quietly lies about
 * what a parent receives.
 *
 * `editable: false` is not a UI decision — those labels are baked into a Meta
 * template that has already been approved under that exact wording. Changing
 * them would need a new template version and another review, so the card shows
 * them read-only with an explanation rather than pretending.
 */

import type { BotStringKey } from './strings'
import type { MessageTemplateType } from './templates'

export type TemplateButton = {
  /** How WhatsApp renders it: a tappable reply, or a link out. */
  kind: 'quick_reply' | 'url'
  /** The bot string holding the label. Editable buttons always have one. */
  labelKey: BotStringKey
  editable: boolean
  /** Why it cannot be edited, for the note under the read-only pills. */
  lockedReason?: 'meta_approved'
  /**
   * The template variable this button's URL comes from.
   *
   * Required on every `url` button, because the senders lift that line out of
   * the body — the button IS the link, and leaving it in the text as well is
   * the duplication this map exists to prevent. The settings preview reads it
   * to run the same strip, so what an owner sees is what a parent receives.
   */
  urlVar?: string
}

export const TEMPLATE_BUTTONS: Partial<Record<MessageTemplateType, TemplateButton[]>> = {
  // Registered on lessio_lesson_reminder_*_v3. Meta stores the labels, so these
  // are locked to the approved wording.
  lesson_reminder: [
    {
      kind: 'quick_reply',
      labelKey: 'btn_confirm_attendance',
      editable: false,
      lockedReason: 'meta_approved',
    },
    {
      kind: 'quick_reply',
      labelKey: 'btn_need_to_cancel',
      editable: false,
      lockedReason: 'meta_approved',
    },
  ],
  homework_assignment: [
    {
      kind: 'quick_reply',
      labelKey: 'btn_homework_done',
      editable: false,
      lockedReason: 'meta_approved',
    },
  ],
  homework_reminder: [
    {
      kind: 'quick_reply',
      labelKey: 'btn_homework_done',
      editable: false,
      lockedReason: 'meta_approved',
    },
  ],
  payment_request: [
    {
      kind: 'url',
      labelKey: 'cta_pay_now',
      editable: false,
      lockedReason: 'meta_approved',
      urlVar: 'payment_link',
    },
  ],
  payment_reminder: [
    {
      kind: 'url',
      labelKey: 'cta_pay_now',
      editable: false,
      lockedReason: 'meta_approved',
      urlVar: 'payment_link',
    },
  ],
  // Registered on lessio_lesson_cancelled_by_teacher_*_v2 and sent through
  // sendTemplateWithQuickReplies. The label is Meta's approved wording, which
  // is NOT cta_book_lesson — see registerTemplates.ts.
  lesson_cancelled_by_teacher: [
    {
      kind: 'quick_reply',
      labelKey: 'btn_book_new_lesson',
      editable: false,
      lockedReason: 'meta_approved',
    },
  ],

  // In-window replies. These go out as free-form interactive messages, never
  // through Meta review, so the wording is the org's to choose.
  booking_link: [
    { kind: 'url', labelKey: 'cta_book_lesson', editable: true, urlVar: 'booking_url' },
  ],
  portal_link_reply: [
    { kind: 'url', labelKey: 'cta_open_portal', editable: true, urlVar: 'portal_url' },
  ],
  balance_reply: [
    { kind: 'url', labelKey: 'cta_open_portal', editable: true, urlVar: 'portal_url' },
  ],
  // payment_history_reply deliberately has NO entry: its body carries no URL
  // variable and handleReceiptQuery sends it as plain text. The preview used to
  // draw a portal button on it that no parent has ever received.
}

/** The buttons a type carries, or an empty list. */
export function buttonsFor(type: MessageTemplateType): TemplateButton[] {
  return TEMPLATE_BUTTONS[type] ?? []
}

/**
 * Labels an owner may rewrite, across every type.
 *
 * The whitelist the save action validates against — a label is editable
 * because a flow renders it at send time, not because a form posted it.
 */
export const CUSTOMIZABLE_BOT_STRINGS: BotStringKey[] = [
  ...new Set(
    Object.values(TEMPLATE_BUTTONS)
      .flat()
      .filter((b) => b.editable)
      .map((b) => b.labelKey)
  ),
]

/**
 * Meta's caps, which are also what the senders clip to. A label longer than
 * this is not rejected at send time — interactive.ts truncates it — so the
 * limit is enforced here, where the owner can still see what they lost.
 */
export const BUTTON_LABEL_MAX = 20

/**
 * A button label the way it actually leaves the wire.
 *
 * The two kinds genuinely differ and must NOT be unified: a cta_url label is
 * hard-cut at 20 (src/lib/whatsapp/index.ts), while a quick reply is cut at 19
 * plus an ellipsis (src/lib/whatsapp/interactive.ts). The settings preview
 * reproduces both rather than relying on CSS truncation, so an owner who types
 * a too-long label sees the loss before a parent does.
 */
export function clipButtonLabel(label: string, kind: TemplateButton['kind']): string {
  const value = label.trim()
  if (kind === 'url') return value.slice(0, BUTTON_LABEL_MAX)
  return value.length <= BUTTON_LABEL_MAX
    ? value
    : value.slice(0, BUTTON_LABEL_MAX - 1).trimEnd() + '…'
}
