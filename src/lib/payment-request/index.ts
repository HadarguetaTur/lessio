/**
 * Payment request utilities.
 * Per /docs/sprint-4-scope.md § Payment Request — Rules.
 * Only pending charges are included. No payment provider integration.
 */

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIntlLocale, type AppLocale } from '@/lib/i18n/locale'
import { OPEN_CHARGE_STATUSES, sumRemaining } from '@/lib/charges'

export interface PaymentRequestCharge {
  id: string
  amount: number
  charge_type: 'lesson' | 'cancellation' | 'manual' | 'monthly'
  lesson_start_at: string | null
  student_name: string | null
}

const CHARGE_TYPE_LABELS: Record<AppLocale, Record<string, string>> = {
  he: {
    lesson: 'שיעור',
    cancellation: 'חיוב ביטול',
    manual: 'חיוב ידני',
    monthly: 'חיוב חודשי',
  },
  en: {
    lesson: 'Lesson',
    cancellation: 'Cancellation charge',
    manual: 'Manual charge',
    monthly: 'Monthly charge',
  },
}

const MESSAGE_STRINGS: Record<AppLocale, Record<string, string>> = {
  he: {
    greeting: 'היי {{name}} 👋',
    intro: 'הנה פירוט החיובים הפתוחים:',
    of: 'של',
    total: 'סה״כ לתשלום',
    payHeader: 'לתשלום מאובטח:',
    thanks: 'תודה 🙏',
    noLink: 'להסדרת התשלום אפשר לפנות אלינו ישירות. תודה 🙏',
  },
  en: {
    greeting: 'Hi {{name}} 👋',
    intro: 'Here are your open charges:',
    of: 'for',
    total: 'Total due',
    payHeader: 'Secure payment:',
    thanks: 'Thank you 🙏',
    noLink: 'To settle the payment, feel free to reach out to us directly. Thank you 🙏',
  },
}

/**
 * Fetches open charges for a parent, including the student name via the lesson.
 *
 * The student name is resolved through `lesson_students`, not a direct
 * `lessons.student_id` — that column was dropped in 20260325000001 when lessons
 * became many-to-many. Embedding `students` under `lessons` no longer resolves.
 *
 * A group lesson has several enrolled students, so the name is narrowed to the
 * ones THIS parent is related to. Picking the first enrolment instead would put
 * another family's child's name in a WhatsApp message. When the parent has no
 * enrolled student on the lesson the name stays null and the line degrades to
 * "Lesson, 12 August" — see buildPaymentRequestMessage.
 */
export async function getPendingChargesForParent(
  parentId: string,
  orgId: string
): Promise<PaymentRequestCharge[]> {
  const supabase = await createClient()

  const [chargesRes, relationsRes] = await Promise.all([
    supabase
      .from('charges')
      .select('id, amount, amount_paid, charge_type, lesson_id, lessons(start_at, lesson_students(student_id, students(full_name)))')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)
      .in('status', [...OPEN_CHARGE_STATUSES])
      .order('created_at', { ascending: true }),
    supabase
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId),
  ])

  if (chargesRes.error) throw new Error(`[getPendingChargesForParent] ${chargesRes.error.message}`)
  if (relationsRes.error) throw new Error(`[getPendingChargesForParent] ${relationsRes.error.message}`)

  const ownStudentIds = new Set((relationsRes.data ?? []).map((r) => r.student_id as string))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (chargesRes.data ?? []).map((c: any) => {
    const enrolments: Array<{ student_id: string; students?: { full_name?: string } | null }> =
      c.lessons?.lesson_students ?? []
    const own = enrolments.find((e) => ownStudentIds.has(e.student_id))

    return {
      id: c.id,
      // What the parent still owes — a partially-paid charge is asked for its
      // remainder, not the original amount.
      amount: sumRemaining([c]),
      charge_type: c.charge_type,
      lesson_start_at: c.lessons?.start_at ?? null,
      student_name: own?.students?.full_name ?? null,
    }
  })
}

/**
 * Builds the WhatsApp payment request message.
 * Pure function — no side effects.
 *
 * If paymentUrl is provided (Cardcom link), it is included in the message.
 * If paymentUrl is null, falls back to the legacy "contact the business owner" text.
 */
export function buildPaymentRequestMessage(
  parentName: string,
  charges: PaymentRequestCharge[],
  timezone: string,
  paymentUrl?: string | null,
  locale: AppLocale = 'he'
): string {
  const s = MESSAGE_STRINGS[locale] ?? MESSAGE_STRINGS.he
  const typeLabels = CHARGE_TYPE_LABELS[locale] ?? CHARGE_TYPE_LABELS.he

  const lines = charges.map((charge, index) => {
    const label = typeLabels[charge.charge_type] ?? charge.charge_type
    let detail = ''
    if (charge.student_name) {
      detail += ` ${s.of} ${charge.student_name}`
    }
    if (charge.lesson_start_at) {
      const date = new Date(charge.lesson_start_at).toLocaleDateString(toIntlLocale(locale), {
        timeZone: timezone,
        day: 'numeric',
        month: 'long',
      })
      detail += `, ${date}`
    }
    return `${index + 1}. ${label}${detail}: ₪${charge.amount.toFixed(2)}`
  })

  const total = charges.reduce((sum, c) => sum + c.amount, 0)

  const paymentLine = paymentUrl
    ? [s.payHeader, paymentUrl, '', s.thanks]
    : [s.noLink]

  return [
    s.greeting.replace('{{name}}', parentName),
    '',
    s.intro,
    '',
    ...lines,
    '',
    `${s.total}: ₪${total.toFixed(2)}`,
    '',
    ...paymentLine,
  ].join('\n')
}

/**
 * Logs sent_at and sent_by_profile_id on all included charges.
 * Idempotent — overwrites previous sent_at if called again.
 * Does NOT change charge status or amounts.
 */
export async function logPaymentRequestSent(
  chargeIds: string[],
  orgId: string,
  profileId: string
): Promise<void> {
  if (chargeIds.length === 0) {
    return
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('charges')
    .update({
      sent_at: new Date().toISOString(),
      sent_by_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .in('id', chargeIds)
    .eq('organization_id', orgId)

  if (error) {
    throw new Error(`[logPaymentRequestSent] ${error.message}`)
  }
}
