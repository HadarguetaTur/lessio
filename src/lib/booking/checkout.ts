/**
 * A booking that waits for payment (decision #46).
 *
 * When a parent books with no entitlement — no subscription covering the
 * lesson and no pack with a credit to spare — they choose a pack from the
 * catalog or a single lesson at its exact price, and PAY BEFORE the lesson
 * exists. There is no "book now, owe later" and nothing for an admin to chase.
 *
 * The gate is on only in an org that chose to collect through punch cards
 * (`pack_collection_enabled`), bills per lesson, and can actually take the
 * money: a payment provider and at least one active pack covering individual
 * lessons. Everywhere else booking behaves exactly as before.
 *
 * Flow: lock (5 min) → startCheckout extends the lock to 15 min, writes the
 * charge (lesson_id NULL until confirmed) and a session, and returns the
 * provider link → the payment webhook calls confirmCheckoutsForCharges, which
 * issues the pack (if chosen) and confirms the lesson ONLY while the lock is
 * still live. A paid pack is issued even if the slot was lost; a lost slot on a
 * paid single lesson becomes `needs_attention` and owners/admins are told.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import {
  isLessonCoveredBySubscription,
  isMissingPrice,
  resolveLessonBaseAmount,
  toStudentPricing,
} from '@/lib/billing/lessonPricing'
import { checkActiveSubscriptionForLesson, type CoverageSubscription } from '@/lib/billing/monthly/subscriptions'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { resolveChargeDueDate } from '@/lib/billing/chargeDueDate'
import { logChargeAudit } from '@/lib/charges/audit'
import { voidCharge } from '@/lib/charges/resolve'
import { getPaymentProvider } from '@/lib/payments/factory'
import { sellPack } from '@/lib/billing/packs/sell'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { validateSlotLock } from './validateSlotLock'
import { confirmBooking } from './confirmBooking'

export const CHECKOUT_HOLD_MINUTES = 15
const BOOKED_LESSON_TYPE = 'individual'

export type BookingEntitlement = 'subscription' | 'pack' | 'none'

export interface CheckoutProduct {
  id: string
  name: string
  credits: number
  price: number
  validity_days: number | null
}

export interface BookingOptions {
  /** True when this booking may only be confirmed after payment. */
  required: boolean
  entitlement: BookingEntitlement
  products: CheckoutProduct[]
  singleLessonPrice: number | null
}

const NOT_REQUIRED: BookingOptions = { required: false, entitlement: 'none', products: [], singleLessonPrice: null }

interface LockShape {
  teacher_id: string
  student_id: string | null
  start_at: string
  end_at: string
}

export async function getBookingOptions(params: {
  organizationId: string
  studentId: string
  lock: LockShape
}): Promise<BookingOptions> {
  const { organizationId, studentId, lock } = params
  const db = createServiceRoleClient()

  const [billing, collection, { data: org }, { data: productRows }] = await Promise.all([
    getOrgBillingPolicy(organizationId),
    getCollectionPolicyServiceRole(organizationId),
    db.from('organizations').select('payment_provider').eq('id', organizationId).maybeSingle(),
    db
      .from('lesson_pack_products')
      .select('id, name, credits, price, validity_days, covered_lesson_types')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .contains('covered_lesson_types', [BOOKED_LESSON_TYPE])
      .order('sort_order'),
  ])
  const products = ((productRows ?? []) as Array<CheckoutProduct & { covered_lesson_types: string[] }>).map((p) => ({
    id: p.id,
    name: p.name,
    credits: Number(p.credits),
    price: Number(p.price),
    validity_days: p.validity_days == null ? null : Number(p.validity_days),
  }))
  if (
    !collection.packCollectionEnabled ||
    billing.billingMode === 'monthly' ||
    !org?.payment_provider ||
    products.length === 0
  ) {
    return NOT_REQUIRED
  }

  const [pricing, timezone] = await Promise.all([getOrgPricing(organizationId), getOrgTimezone(organizationId)])
  const lessonDate = DateTime.fromISO(lock.start_at, { zone: timezone }).toISODate()!

  if (pricing.subscriptionCoveredLessonTypes.includes(BOOKED_LESSON_TYPE)) {
    const { data: subs } = await db
      .from('subscriptions')
      .select('student_id, start_date, end_date, is_paused')
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
    if (
      isLessonCoveredBySubscription(
        BOOKED_LESSON_TYPE,
        pricing.subscriptionCoveredLessonTypes,
        checkActiveSubscriptionForLesson(studentId, lessonDate, (subs as CoverageSubscription[] | null) ?? [])
      )
    ) {
      return { required: true, entitlement: 'subscription', products, singleLessonPrice: null }
    }
  }

  if (await hasSpareCredit(organizationId, studentId, lessonDate)) {
    return { required: true, entitlement: 'pack', products, singleLessonPrice: null }
  }

  const [{ data: teacher }, { data: student }] = await Promise.all([
    db.from('teachers').select('hourly_rate').eq('id', lock.teacher_id).eq('organization_id', organizationId).maybeSingle(),
    db.from('students').select('hourly_rate, discount_percent').eq('id', studentId).eq('organization_id', organizationId).maybeSingle(),
  ])
  const studentPricing = toStudentPricing(student)
  const price = resolveLessonBaseAmount(
    {
      lessonType: BOOKED_LESSON_TYPE,
      pricePerStudent: null,
      durationMinutes: (new Date(lock.end_at).getTime() - new Date(lock.start_at).getTime()) / 60_000,
      teacherHourlyRate: (teacher?.hourly_rate as number | null) ?? null,
      studentHourlyRate: studentPricing.hourlyRate,
      studentDiscountPercent: studentPricing.discountPercent,
    },
    pricing
  )
  return { required: true, entitlement: 'none', products, singleLessonPrice: isMissingPrice(price) ? null : price }
}

/**
 * A usable pack with a credit not already spoken for by the student's lessons
 * booked ahead. A forecast, not a reservation: the punch itself is taken when
 * the lesson is completed (consume_pack_credit decides then).
 */
async function hasSpareCredit(organizationId: string, studentId: string, lessonDate: string): Promise<boolean> {
  const db = createServiceRoleClient()
  let parentId: string | null = null
  try {
    parentId = await resolveBillingParent(studentId, organizationId)
  } catch (e) {
    if (!(e instanceof MissingPrimaryParentError)) throw e
  }
  let query = db
    .from('lesson_pack_balances')
    .select('remaining, valid_until')
    .eq('organization_id', organizationId)
    .is('cancelled_at', null)
    .not('activated_at', 'is', null)
    .lte('valid_from', lessonDate)
    .contains('covered_lesson_types', [BOOKED_LESSON_TYPE])
    .gt('remaining', 0)
  query = parentId
    ? query.or(`student_id.eq.${studentId},and(student_id.is.null,parent_id.eq.${parentId})`)
    : query.eq('student_id', studentId)
  const { data: packs, error } = await query
  if (error) throw new Error(`[checkout] pack lookup failed: ${error.message}`)
  const credits = ((packs ?? []) as Array<{ remaining: number; valid_until: string | null }>)
    .filter((p) => !p.valid_until || p.valid_until >= lessonDate)
    .reduce((sum, p) => sum + Number(p.remaining), 0)
  if (credits <= 0) return false

  const { data: ahead } = await db
    .from('lesson_students')
    .select('lesson_id, lessons!inner(status, start_at)')
    .eq('student_id', studentId)
    .eq('lessons.status', 'scheduled')
    .gte('lessons.start_at', new Date().toISOString())
  return credits > (ahead ?? []).length
}

export type StartCheckoutFailure =
  | 'lock_invalid'
  | 'not_required'
  | 'product_not_found'
  | 'price_unavailable'
  | 'missing_parent'
  | 'provider_failed'
  | 'failed'

export async function startCheckout(params: {
  organizationId: string
  studentId: string
  teacherId: string
  lockId: string
  selection: 'pack' | 'single_lesson'
  productId?: string | null
}): Promise<{ ok: true; url: string } | { ok: false; reason: StartCheckoutFailure }> {
  const { organizationId, studentId, teacherId, lockId } = params
  const db = createServiceRoleClient()

  const lockResult = await validateSlotLock(lockId, organizationId)
  if (!lockResult.valid || lockResult.lock.student_id !== studentId || lockResult.lock.teacher_id !== teacherId) {
    return { ok: false, reason: 'lock_invalid' }
  }
  const lock = lockResult.lock

  // Coming back to a checkout already started for this slot reuses its link.
  const { data: existing } = await db
    .from('booking_checkout_sessions')
    .select('id, status, payment_link, expires_at')
    .eq('organization_id', organizationId)
    .eq('slot_lock_id', lockId)
    .maybeSingle()
  if (existing?.status === 'pending' && existing.payment_link && new Date(existing.expires_at as string) > new Date()) {
    return { ok: true, url: existing.payment_link as string }
  }
  if (existing) return { ok: false, reason: 'lock_invalid' }

  const options = await getBookingOptions({ organizationId, studentId, lock })
  if (!options.required || options.entitlement !== 'none') return { ok: false, reason: 'not_required' }

  const product = params.selection === 'pack' ? options.products.find((p) => p.id === params.productId) : null
  if (params.selection === 'pack' && !product) return { ok: false, reason: 'product_not_found' }
  const amount = product ? product.price : options.singleLessonPrice
  if (amount == null || amount <= 0) return { ok: false, reason: 'price_unavailable' }

  let parentId: string
  try {
    parentId = await resolveBillingParent(studentId, organizationId)
  } catch (e) {
    if (e instanceof MissingPrimaryParentError) return { ok: false, reason: 'missing_parent' }
    throw e
  }

  const timezone = await getOrgTimezone(organizationId)
  const expiresAt = new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000).toISOString()
  const chargeType = product ? 'pack' : 'lesson'

  const { data: charge, error: chargeError } = await db
    .from('charges')
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      student_id: studentId,
      // lesson_id stays NULL until the payment confirms the lesson.
      amount,
      charge_type: chargeType,
      status: 'pending',
      due_date: resolveChargeDueDate({ chargeType, issuedAt: new Date(), timezone }),
    })
    .select('id')
    .single()
  if (chargeError || !charge) {
    console.error('[checkout] charge insert failed', { organizationId, studentId, error: chargeError?.message })
    return { ok: false, reason: 'failed' }
  }
  const chargeId = charge.id as string
  await logChargeAudit({
    organizationId,
    chargeId,
    parentId,
    eventType: 'created',
    afterStatus: 'pending',
    afterAmount: amount,
    metadata: { source: 'booking_checkout', selection: params.selection, product_id: product?.id ?? null, slot_lock_id: lockId },
  })

  const abandon = async () => {
    await voidCharge(chargeId, organizationId, null, 'booking_checkout_failed')
  }

  const { data: extended } = await db
    .from('slot_locks')
    .update({ expires_at: expiresAt })
    .eq('id', lockId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (!extended) {
    await abandon()
    return { ok: false, reason: 'lock_invalid' }
  }

  const { data: session, error: sessionError } = await db
    .from('booking_checkout_sessions')
    .insert({
      organization_id: organizationId,
      parent_id: parentId,
      student_id: studentId,
      teacher_id: teacherId,
      slot_lock_id: lockId,
      selection: params.selection,
      pack_product_id: product?.id ?? null,
      charge_id: chargeId,
      lesson_start_at: lock.start_at,
      lesson_end_at: lock.end_at,
      lesson_type: BOOKED_LESSON_TYPE,
      quoted_amount: amount,
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (sessionError || !session) {
    console.error('[checkout] session insert failed', { organizationId, lockId, error: sessionError?.message })
    await abandon()
    return { ok: false, reason: 'failed' }
  }

  try {
    const { data: parent } = await db
      .from('parents')
      .select('full_name, phone, preferred_locale')
      .eq('id', parentId)
      .eq('organization_id', organizationId)
      .single()
    const { data: org } = await db.from('organizations').select('default_locale').eq('id', organizationId).maybeSingle()
    const locale = resolveRecipientLocale({
      stored: (parent?.preferred_locale as string | null) ?? null,
      orgDefault: (org?.default_locale as string | null) ?? null,
    })
    const tr = await getT('receipts', locale)
    const { provider, providerName } = await getPaymentProvider(organizationId)
    const link = await provider.createPaymentLink({
      chargeId,
      amount,
      description: tr(product ? 'packPayment' : 'lessonPayment', { name: (parent?.full_name as string) ?? '' }),
      orgId: organizationId,
      payer: parent?.phone ? { fullName: parent.full_name as string, phone: parent.phone as string } : undefined,
    })

    const { error: persistError } = await db
      .from('charges')
      .update({
        payment_link: link.url,
        payment_reference: link.reference,
        payment_provider: providerName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chargeId)
      .eq('organization_id', organizationId)
    // A link whose reference was never stored is a payment no webhook can place.
    if (persistError) throw new Error(persistError.message)

    await db
      .from('booking_checkout_sessions')
      .update({ payment_reference: link.reference, payment_link: link.url })
      .eq('id', session.id)
    return { ok: true, url: link.url }
  } catch (err) {
    console.error('[checkout] payment link failed', { organizationId, lockId, err })
    await db.from('booking_checkout_sessions').update({ status: 'cancelled', failure_reason: 'provider_failed' }).eq('id', session.id)
    await abandon()
    return { ok: false, reason: 'provider_failed' }
  }
}

/** The parent backed out before paying: release the slot and retract the charge. */
export async function cancelCheckout(params: {
  organizationId: string
  sessionId: string
  parentStudentIds: readonly string[]
}): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data: claimed } = await db
    .from('booking_checkout_sessions')
    .update({ status: 'cancelled', failure_reason: 'parent_cancelled' })
    .eq('id', params.sessionId)
    .eq('organization_id', params.organizationId)
    .eq('status', 'pending')
    .in('student_id', params.parentStudentIds as string[])
    .select('slot_lock_id, charge_id')
    .maybeSingle()
  if (!claimed) return false
  await db.from('slot_locks').update({ status: 'expired' }).eq('id', claimed.slot_lock_id).eq('status', 'active')
  if (claimed.charge_id) await voidCharge(claimed.charge_id as string, params.organizationId, null, 'booking_checkout_cancelled')
  return true
}

/**
 * Called by the payment webhook for charges it just settled. Idempotent: a
 * session is claimed with pending → paid, so a redelivered callback finds
 * nothing to do.
 */
export async function confirmCheckoutsForCharges(organizationId: string, chargeIds: readonly string[]): Promise<void> {
  if (chargeIds.length === 0) return
  const db = createServiceRoleClient()
  const { data: sessions, error } = await db
    .from('booking_checkout_sessions')
    .select('id, student_id, teacher_id, slot_lock_id, selection, pack_product_id, charge_id')
    .eq('organization_id', organizationId)
    .in('charge_id', chargeIds as string[])
    .in('status', ['pending', 'expired'])
  if (error) {
    console.error('[checkout] session lookup failed', { organizationId, error: error.message })
    return
  }

  for (const session of (sessions ?? []) as Array<{
    id: string
    student_id: string
    teacher_id: string
    slot_lock_id: string
    selection: 'pack' | 'single_lesson'
    pack_product_id: string | null
    charge_id: string
  }>) {
    const { data: claimed } = await db
      .from('booking_checkout_sessions')
      .update({ status: 'paid' })
      .eq('id', session.id)
      .in('status', ['pending', 'expired'])
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    let packId: string | null = null
    if (session.selection === 'pack' && session.pack_product_id) {
      // The parent paid for the card — it is theirs whatever happens to the slot.
      const sale = await sellPack({
        organizationId,
        productId: session.pack_product_id,
        studentId: session.student_id,
        existingChargeId: session.charge_id,
        actorProfileId: null,
      })
      if (sale.ok) packId = sale.packId
      else console.error('[checkout] paid pack could not be issued', { organizationId, sessionId: session.id, reason: sale.reason })
    }

    try {
      const booked = await confirmBooking({
        lockId: session.slot_lock_id,
        studentId: session.student_id,
        teacherId: session.teacher_id,
        organizationId,
      })
      if (session.selection === 'single_lesson') {
        await db.from('charges').update({ lesson_id: booked.lessonId }).eq('id', session.charge_id).eq('organization_id', organizationId)
      }
      await db
        .from('booking_checkout_sessions')
        .update({ status: 'confirmed', lesson_id: booked.lessonId, pack_id: packId })
        .eq('id', session.id)
    } catch (err) {
      // The slot was lost (lock expired, conflict). No lesson is created and no
      // money is moved back automatically — a person decides.
      console.error('[checkout] paid booking could not be confirmed', { organizationId, sessionId: session.id, err })
      await db
        .from('booking_checkout_sessions')
        .update({ status: 'needs_attention', pack_id: packId, failure_reason: err instanceof Error ? err.name : 'unknown' })
        .eq('id', session.id)
      await notifyBookingNeedsAttention(organizationId)
    }
  }
}

async function notifyBookingNeedsAttention(organizationId: string): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const [{ notifyMultiple, getOwnerAndAdminProfileIds }, { data: org }] = await Promise.all([
      import('@/lib/notifications'),
      db.from('organizations').select('default_locale').eq('id', organizationId).maybeSingle(),
    ])
    const t = await getT('packs', org?.default_locale === 'en' ? 'en' : 'he')
    await notifyMultiple(
      organizationId,
      await getOwnerAndAdminProfileIds(organizationId),
      'pack_attention',
      t('notifications.bookingNeedsAttentionTitle'),
      t('notifications.bookingNeedsAttentionBody'),
      '/charges'
    )
  } catch (err) {
    console.error('[checkout] attention notification failed', { organizationId, err })
  }
}
