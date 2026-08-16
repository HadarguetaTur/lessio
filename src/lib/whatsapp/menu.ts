/**
 * The tappable main menu and the "which student?" follow-up.
 *
 * State-free by design: the chosen student rides inside the reply payload
 * ("m:book:<studentId>") rather than in a session row, so a parent can leave the
 * conversation for a day and their tap still resolves correctly.
 *
 * Menu actions map 1:1 onto the keyword intents, so typing "ביטול" and tapping
 * "ביטול שיעור" reach the same handler — the keywords stay as a fallback for
 * anyone whose client renders the buttons poorly.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { botString } from './strings'
import { sendListMessage, sendReplyButtons, REPLY_BUTTONS_MAX } from './interactive'

export type MenuAction = 'book' | 'cancel' | 'balance' | 'schedule' | 'portal'

const PREFIX = 'm'

/** Actions that operate on one specific student and therefore need a picker. */
const PER_STUDENT_ACTIONS: ReadonlySet<MenuAction> = new Set<MenuAction>(['book'])

export function needsStudent(action: MenuAction): boolean {
  return PER_STUDENT_ACTIONS.has(action)
}

export function encodeMenuPayload(action: MenuAction, studentId?: string): string {
  return studentId ? `${PREFIX}:${action}:${studentId}` : `${PREFIX}:${action}`
}

/**
 * Parses a tapped payload. Returns null for anything that is not one of our
 * menu payloads, so unknown ids fall through to normal intent handling.
 */
export function decodeMenuPayload(
  replyId: string | undefined
): { action: MenuAction; studentId?: string } | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== PREFIX || parts.length < 2) return null

  const action = parts[1] as MenuAction
  if (!['book', 'cancel', 'balance', 'schedule', 'portal'].includes(action)) return null

  const studentId = parts.slice(2).join(':') || undefined
  return { action, studentId }
}

/**
 * True when the message is a bare greeting ("היי", "hello") — the trigger for
 * showing the menu proactively. Deliberately anchored and short: a sentence that
 * merely opens with "hi" usually carries a real question that the AI should get.
 */
export function isGreeting(text: string): boolean {
  const t = text.trim().replace(/[!?.,\s]+$/g, '')
  if (t.length > 12) return false
  return /^(היי|הי|שלום|אהלן|בוקר טוב|ערב טוב|hi|hey|hello|shalom)$/i.test(t)
}

/** First token of a full name, used for the greeting. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * Sends the greeting + action list. Falls back to the plain-text template when
 * the interactive send fails, so a parent is never left without an answer.
 */
export async function sendMainMenu(params: {
  phone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  parentFullName?: string | null
  onFallback: () => Promise<void>
}): Promise<void> {
  const { phone, accessToken, phoneNumberId, locale, parentFullName, onFallback } = params

  const name = firstName(parentFullName)
  // Without a name the greeting would read "היי  👋" — collapse the gap instead.
  const greeting = botString('menu_greeting', locale, { first_name: name }).replace(
    /[ \t]+(?=\n|👋)/g,
    ''
  )

  const rows = (['book', 'cancel', 'balance', 'schedule', 'portal'] as const).map((action) => ({
    id: encodeMenuPayload(action),
    title: botString(`menu_${action}` as const, locale),
    description: botString(`menu_${action}_desc` as const, locale),
  }))

  try {
    await sendListMessage(
      phone,
      {
        body: greeting,
        buttonLabel: botString('menu_button', locale),
        sectionTitle: botString('menu_section', locale),
        rows,
      },
      accessToken,
      phoneNumberId
    )
  } catch (err) {
    // 131047 (outside the 24h window) or a client that cannot render lists.
    console.warn('[whatsapp/menu] Interactive menu failed — falling back to text', {
      phone,
      error: String(err),
    })
    await onFallback()
  }
}

/**
 * Asks which student an action applies to. Uses reply buttons for up to three
 * students (visible without a tap) and a list beyond that.
 */
export async function sendStudentPicker(params: {
  phone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  action: MenuAction
  students: Array<{ id: string; full_name: string | null }>
}): Promise<void> {
  const { phone, accessToken, phoneNumberId, locale, action, students } = params

  const options = students.map((s, i) => ({
    id: encodeMenuPayload(action, s.id),
    title: s.full_name?.trim() || `${botString('the_student', locale)} ${i + 1}`,
  }))

  const body = botString('child_picker_body', locale)

  if (options.length <= REPLY_BUTTONS_MAX) {
    await sendReplyButtons(phone, { body, buttons: options }, accessToken, phoneNumberId)
    return
  }

  await sendListMessage(
    phone,
    {
      body,
      buttonLabel: botString('child_picker_button', locale),
      sectionTitle: botString('child_picker_section', locale),
      rows: options,
    },
    accessToken,
    phoneNumberId
  )
}
