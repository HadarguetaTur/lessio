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
import type { KnownSenderRole } from './sender'
import {
  sendListMessage,
  sendReplyButtons,
  sendTemplateWithQuickReplies,
  REPLY_BUTTONS_MAX,
} from './interactive'

/**
 * Approved template twin of the menu, for sends outside the 24h window.
 * Button order must match the registration in registerTemplates.ts.
 */
/**
 * `usesName` mirrors whether the registered body has a {{1}} placeholder. The
 * English template has none on purpose (see menu_greeting in strings.ts), and
 * Meta rejects a parameter that the template does not declare.
 */
const MENU_TEMPLATE: Record<AppLocale, { name: string; usesName: boolean }> = {
  he: { name: 'lessio_menu_he_v2', usesName: true },
  en: { name: 'lessio_menu_en_v3', usesName: false },
}
const MENU_TEMPLATE_ACTIONS: MenuAction[] = ['book', 'cancel', 'balance']

export type MenuAction =
  // Parent
  | 'book'
  | 'cancel'
  | 'balance'
  | 'schedule'
  | 'portal'
  // Student
  | 'homework'
  // Teacher
  | 'my_schedule'
  | 'my_students'
  | 'day_off'
  // Staff (owner/admin)
  | 'today_summary'
  | 'pending_requests'
  // Teacher and staff — each to their own shell
  | 'dashboard'
  // Any role whose phone holds several capacities
  | 'switch_role'

const ALL_ACTIONS: readonly MenuAction[] = [
  'book',
  'cancel',
  'balance',
  'schedule',
  'portal',
  'homework',
  'my_schedule',
  'my_students',
  'day_off',
  'today_summary',
  'pending_requests',
  'dashboard',
  'switch_role',
]

/**
 * What each capacity may do over WhatsApp.
 *
 * The student list still omits balance and the portal: what the family owes is
 * not a child's to see or settle, and the portal is a parent portal with no
 * student login path at all. Booking and cancelling are theirs — it is their
 * lesson — but both are scoped to their own row, and both run through their
 * billing parent, who is copied on every cancellation because the charge lands
 * on them.
 *
 * The teacher and staff lists are otherwise read-only on purpose — WhatsApp has
 * no real confirmation step, and a mistyped reply on a teacher path would move a
 * parent's charge. Attendance stays in the dashboard.
 *
 * `day_off` is the one deliberate exception, and it is not really a write: it
 * files a request. Nothing moves until an owner or admin taps approve, which is
 * what makes it safe to expose on a channel with no confirmation step.
 */
const ROLE_MENUS: Record<KnownSenderRole, readonly MenuAction[]> = {
  parent: ['book', 'cancel', 'balance', 'schedule', 'portal'],
  student: ['book', 'cancel', 'schedule', 'homework'],
  teacher: ['my_schedule', 'my_students', 'day_off', 'dashboard'],
  staff: ['today_summary', 'pending_requests', 'dashboard'],
}

/** The actions a role may invoke, plus the role switcher when it applies. */
export function menuActionsFor(role: KnownSenderRole, canSwitchRole = false): MenuAction[] {
  const actions = [...ROLE_MENUS[role]]
  // Meta caps a list section at 10 rows; no role menu comes close.
  if (canSwitchRole) actions.push('switch_role')
  return actions
}

/** True when this capacity is allowed to invoke this action. */
export function isActionAllowedForRole(action: MenuAction, role: KnownSenderRole): boolean {
  return action === 'switch_role' || ROLE_MENUS[role].includes(action)
}

const PREFIX = 'm'
const ROLE_PREFIX = 'r'

/**
 * Actions that operate on one specific student and therefore need a picker.
 * Only the parent path consults this — a student writing in is already the
 * subject, so there is nothing to pick.
 */
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
 *
 * Whether the *sender* may run the decoded action is a separate question —
 * see isActionAllowedForRole. A payload is client-supplied and a student could
 * echo back "m:balance" from a menu they were never shown.
 */
export function decodeMenuPayload(
  replyId: string | undefined
): { action: MenuAction; studentId?: string } | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== PREFIX || parts.length < 2) return null

  const action = parts[1] as MenuAction
  if (!ALL_ACTIONS.includes(action)) return null

  const studentId = parts.slice(2).join(':') || undefined
  return { action, studentId }
}

export function encodeRolePayload(role: KnownSenderRole): string {
  return `${ROLE_PREFIX}:${role}`
}

/** Parses a tapped role-switch payload ("r:teacher"). */
export function decodeRolePayload(replyId: string | undefined): KnownSenderRole | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== ROLE_PREFIX || parts.length !== 2) return null

  const role = parts[1] as KnownSenderRole
  return ['parent', 'student', 'teacher', 'staff'].includes(role) ? role : null
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
 * Sends the greeting + action list for the sender's capacity. Falls back to the
 * plain-text template when the interactive send fails, so nobody is left
 * without an answer.
 */
export async function sendMainMenu(params: {
  phone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  fullName?: string | null
  role?: KnownSenderRole
  canSwitchRole?: boolean
  onFallback: () => Promise<void>
}): Promise<void> {
  const { phone, accessToken, phoneNumberId, locale, fullName, onFallback } = params
  const role = params.role ?? 'parent'

  const name = firstName(fullName)
  // A separate no-name string instead of patching whitespace out of the greeting.
  // Note the English greeting has no {{first_name}} at all — names are stored in
  // Hebrew and reading "Hi יעל 👋" is worse than reading "Hi 👋".
  const greeting = botString(name ? 'menu_greeting' : 'menu_greeting_noname', locale, {
    first_name: name,
  })

  const actions = menuActionsFor(role, params.canSwitchRole)
  const rows = actions.map((action) => ({
    id: action === 'switch_role' ? encodeMenuPayload('switch_role') : encodeMenuPayload(action),
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
    // The approved template still carries buttons, so try it before plain text.
    console.warn('[whatsapp/menu] Interactive menu failed — trying template', {
      phone,
      role,
      error: String(err),
    })

    // The approved menu template is parent-voiced ("book a lesson", "balance").
    // Sending it to a teacher or student outside the 24h window would offer
    // actions their role cannot run, so they go straight to text until a
    // per-role template is approved at Meta.
    if (role === 'parent') {
      const template = MENU_TEMPLATE[locale] ?? MENU_TEMPLATE.he
      try {
        await sendTemplateWithQuickReplies(
          phone,
          {
            name: template.name,
            languageCode: locale,
            // Meta rejects both an empty parameter and a parameter the template
            // never declared, so this follows the registered body exactly.
            bodyParams: template.usesName
              ? [name || botString('dear_parents', locale)]
              : [],
            payloads: MENU_TEMPLATE_ACTIONS.map((a) => encodeMenuPayload(a)),
          },
          accessToken,
          phoneNumberId
        )
        return
      } catch (templateErr) {
        console.warn('[whatsapp/menu] Menu template failed — falling back to text', {
          phone,
          error: String(templateErr),
        })
      }
    }

    await onFallback()
  }
}

/**
 * Asks which capacity to continue in, for a phone that holds several in one org.
 */
export async function sendRolePicker(params: {
  phone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  roles: KnownSenderRole[]
}): Promise<void> {
  const { phone, accessToken, phoneNumberId, locale, roles } = params

  const options = roles.map((r) => ({
    id: encodeRolePayload(r),
    title: botString(`role_label_${r}` as const, locale),
  }))

  const body = botString('role_switch_body', locale)

  if (options.length <= REPLY_BUTTONS_MAX) {
    await sendReplyButtons(phone, { body, buttons: options }, accessToken, phoneNumberId)
    return
  }

  await sendListMessage(
    phone,
    {
      body,
      buttonLabel: botString('menu_button', locale),
      sectionTitle: botString('menu_section', locale),
      rows: options,
    },
    accessToken,
    phoneNumberId
  )
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
