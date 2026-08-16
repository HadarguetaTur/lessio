/**
 * Payment request utilities.
 * Per /docs/sprint-4-scope.md § Payment Request — Rules.
 * Only pending charges are included. No payment provider integration.
 */

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIntlLocale, type AppLocale } from '@/lib/i18n/locale'

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
 * Fetches pending charges for a parent, including student name via lesson join.
 */
export async function getPendingChargesForParent(
  parentId: string,
  orgId: string
): Promise<PaymentRequestCharge[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('charges')
    .select('id, amount, charge_type, lesson_id, lessons(start_at, students(full_name))')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[getPendingChargesForParent] ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    id: c.id,
    amount: Number(c.amount),
    charge_type: c.charge_type,
    lesson_start_at: c.lessons?.start_at ?? null,
    student_name: c.lessons?.students?.full_name ?? null,
  }))
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
