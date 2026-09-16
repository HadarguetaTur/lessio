/**
 * The one reconciler for a lesson's outcome (decision #46).
 *
 * Replaces `createLessonCharge` at every completion entry point. It reads what
 * the lesson SHOULD leave behind for each enrolled student — nothing, a punch,
 * or money — and aligns the ledger and the charges to it:
 *
 *   present   subscription → nothing · pack → consume_lesson · else lesson charge
 *   absent    subscription → nothing · pack + policy 'consume' → consume_no_show
 *             · else no_show charge at the policy percentage (0% → nothing)
 *   reopened  (back to scheduled) nothing may remain
 *
 * Idempotent: running it twice changes nothing. What already exists for the
 * current outcome stays — a lesson charge raised before a pack was activated is
 * never retroactively punched. What belongs to a DIFFERENT outcome is retired:
 * a pending charge is voided ('outcome_changed') and a punch is reversed. A
 * paid charge is never touched — the attendance stands and an
 * `outcome_conflict` alert goes back to the caller.
 *
 * In a monthly org no charge is written: the monthly engine reads the ledger
 * and `lesson_students.absence_amount`, which this writes in both modes.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { logChargeAudit } from '@/lib/charges/audit'
import { voidCharge } from '@/lib/charges/resolve'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgTimezone } from '@/lib/organizations'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import {
  resolveLessonBaseAmount,
  isMissingPrice,
  isLessonCoveredBySubscription,
  toStudentPricing,
} from '@/lib/billing/lessonPricing'
import { checkActiveSubscriptionForLesson, type CoverageSubscription } from '@/lib/billing/monthly/subscriptions'
import { resolveChargeDueDate } from '@/lib/billing/chargeDueDate'
import type { ChargeAlert } from '@/lib/billing/createCharge'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { isStudentAbsent } from '@/lib/lessons/attendance'
import type { LessonType } from '@/lib/lessons/types'
import { consumePackCredit, loadLessonPackUses, reverseLedgerEntries } from '@/lib/billing/packs/ledger'
import { notifyPackBalances } from '@/lib/billing/packs/notify'
import { priceOutcome, type PackConsumeKind } from './priceOutcome'

type OutcomeChargeType = 'lesson' | 'no_show'

interface ExistingCharge {
  id: string
  student_id: string | null
  parent_id: string | null
  charge_type: OutcomeChargeType
  status: string
  amount: number
}

interface RosterEntry {
  student_id: string
  attendance: string | null
  absence_amount: number | string | null
  absence_covered_by: string | null
  students?: { hourly_rate: number | null; discount_percent: number | null } | null
}

const OPEN_STATUSES = new Set(['pending', 'invoiced'])
const RETIRED_STATUSES = new Set(['voided', 'waived'])

export interface SettleOptions {
  /** Who caused this settlement; NULL for the cron and other system paths. */
  actorProfileId?: string | null
  /** Called with every pack that lost a credit, for balance notifications. */
  onPackConsumed?: (packId: string) => void
}

export async function settleLessonOutcome(
  lessonId: string,
  organizationId: string,
  options: SettleOptions = {}
): Promise<ChargeAlert | null> {
  const db = createServiceRoleClient()
  const actor = options.actorProfileId ?? null

  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .select(
      'id, status, start_at, end_at, lesson_type, price_per_student, teachers(id, hourly_rate), lesson_students(student_id, attendance, absence_amount, absence_covered_by, students(hourly_rate, discount_percent))'
    )
    .eq('id', lessonId)
    .eq('organization_id', organizationId)
    .single()

  if (lessonError || !lesson) {
    console.error('[settleLessonOutcome] lesson not found', { lessonId, organizationId, error: lessonError?.message })
    return { type: 'error', message: 'validation.lessonNotFound' }
  }

  // A cancelled lesson's money belongs to cancelLessonCore.
  if (lesson.status === 'cancelled') return null

  const roster = ((lesson.lesson_students as unknown as RosterEntry[]) ?? [])
  const delivered = lesson.status === 'completed' || lesson.status === 'no_show'
  if (delivered && roster.length === 0) {
    return { type: 'missing_parent', message: 'validation.noLinkedStudents' }
  }

  const [billing, pricing, timezone, collection] = await Promise.all([
    getOrgBillingPolicy(organizationId),
    getOrgPricing(organizationId),
    getOrgTimezone(organizationId),
    getCollectionPolicyServiceRole(organizationId),
  ])
  const perLesson = billing.billingMode !== 'monthly'
  const lessonType = ((lesson.lesson_type as LessonType | null) ?? 'individual')
  const lessonDate = DateTime.fromISO(lesson.start_at as string, { zone: timezone }).toISODate()!
  const teacher = lesson.teachers as unknown as { id: string; hourly_rate: number | null } | null
  const durationMinutes =
    (new Date(lesson.end_at as string).getTime() - new Date(lesson.start_at as string).getTime()) / 60_000

  let subscriptions: CoverageSubscription[] = []
  if (delivered && pricing.subscriptionCoveredLessonTypes.includes(lessonType)) {
    const { data, error } = await db
      .from('subscriptions')
      .select('student_id, start_date, end_date, is_paused')
      .eq('organization_id', organizationId)
      .in('student_id', roster.map((r) => r.student_id))
    // Charging because the coverage lookup broke is the double charge this avoids.
    if (error) {
      console.error('[settleLessonOutcome] subscription lookup failed', { lessonId, organizationId, error: error.message })
      return { type: 'error', message: 'validation.createChargeFailed' }
    }
    subscriptions = (data as CoverageSubscription[] | null) ?? []
  }

  const { data: chargeRows, error: chargesError } = await db
    .from('charges')
    .select('id, student_id, parent_id, charge_type, status, amount')
    .eq('organization_id', organizationId)
    .eq('lesson_id', lessonId)
    .in('charge_type', ['lesson', 'no_show'])
  // Never decide about money on a broken read of the money.
  if (chargesError) {
    console.error('[settleLessonOutcome] charge lookup failed', { lessonId, organizationId, error: chargesError.message })
    return { type: 'error', message: 'validation.createChargeFailed' }
  }
  const charges = ((chargeRows ?? []) as ExistingCharge[]).map((c) => ({ ...c, amount: Number(c.amount) }))
  const uses = await loadLessonPackUses(organizationId, lessonId)

  const alerts: ChargeAlert[] = []
  const conflict: ChargeAlert = { type: 'outcome_conflict', message: 'validation.outcomeConflictsPaidCharge' }

  /** Retires a charge that belongs to a different outcome. False when it must stay. */
  const retire = async (charge: ExistingCharge, reason: string): Promise<boolean> => {
    if (!OPEN_STATUSES.has(charge.status)) {
      if (charge.status === 'paid') alerts.push(conflict)
      return false
    }
    const result = await voidCharge(charge.id, organizationId, actor, reason)
    if (result.ok || result.reason === 'already_resolved') return true
    // A shared payment link or a racing payment — leave it for a human.
    alerts.push(conflict)
    return false
  }

  const writeAbsence = async (entry: RosterEntry, amount: number | null, coveredBy: 'subscription' | 'pack' | null) => {
    const current = entry.absence_amount == null ? null : Number(entry.absence_amount)
    if (current === amount && (entry.absence_covered_by ?? null) === coveredBy) return
    const { error } = await db
      .from('lesson_students')
      .update({ absence_amount: amount, absence_covered_by: coveredBy })
      .eq('lesson_id', lessonId)
      .eq('student_id', entry.student_id)
    if (error) {
      console.error('[settleLessonOutcome] absence snapshot failed', { lessonId, studentId: entry.student_id, error: error.message })
      alerts.push({ type: 'error', message: 'validation.createChargeFailed' })
    }
  }

  const dueDate = resolveChargeDueDate({ chargeType: 'lesson', issuedAt: new Date(), timezone })
  const consumedPackIds: string[] = []

  for (const entry of roster) {
    const studentId = entry.student_id
    const live = charges.filter((c) => c.student_id === studentId && !RETIRED_STATUSES.has(c.status))
    const lessonCharge = live.find((c) => c.charge_type === 'lesson')
    const noShowCharge = live.find((c) => c.charge_type === 'no_show')
    const myUses = uses.filter((u) => u.student_id === studentId && u.kind !== 'consume_late_cancel')

    // ── Reopened: nothing a delivered lesson left behind may remain ──────────
    if (!delivered) {
      for (const charge of [lessonCharge, noShowCharge]) if (charge) await retire(charge, 'lesson_reopened')
      await reverseLedgerEntries(organizationId, myUses.map((u) => u.id), 'lesson_reopened')
      await writeAbsence(entry, null, null)
      continue
    }

    const absent = isStudentAbsent(lesson.status as string, entry.attendance)
    const wantKind: PackConsumeKind = absent ? 'consume_no_show' : 'consume_lesson'
    const rightMoney = absent ? noShowCharge : lessonCharge
    const wrongMoney = absent ? lessonCharge : noShowCharge
    const rightUse = myUses.find((u) => u.kind === wantKind)
    const wrongUses = myUses.filter((u) => u.kind !== wantKind)

    // ── 1. The outcome flipped: retire what the other outcome left ───────────
    if (wrongMoney) await retire(wrongMoney, 'outcome_changed')
    await reverseLedgerEntries(organizationId, wrongUses.map((u) => u.id), 'outcome_changed')

    const covered = isLessonCoveredBySubscription(
      lessonType,
      pricing.subscriptionCoveredLessonTypes,
      checkActiveSubscriptionForLesson(studentId, lessonDate, subscriptions)
    )
    if (covered) {
      if (rightMoney) await retire(rightMoney, 'outcome_changed')
      if (rightUse) await reverseLedgerEntries(organizationId, [rightUse.id], 'subscription_covers')
      await writeAbsence(entry, absent ? 0 : null, absent ? 'subscription' : null)
      continue
    }

    // A legacy row with no student_id is this lesson's charge from before
    // charges.student_id — treated as the present student's money, never voided.
    const legacyLessonCharge =
      !absent && charges.some((c) => c.student_id == null && c.charge_type === 'lesson' && !RETIRED_STATUSES.has(c.status))

    // ── 2. Stable: what exists for this outcome stays. Money wins a tie ──────
    if (rightMoney || legacyLessonCharge) {
      if (rightUse) await reverseLedgerEntries(organizationId, [rightUse.id], 'charge_exists')
      await writeAbsence(entry, absent && rightMoney ? rightMoney.amount : null, null)
      continue
    }
    if (rightUse) {
      await writeAbsence(entry, absent ? 0 : null, absent ? 'pack' : null)
      continue
    }

    // ── 3. Nothing yet: a punch, then money ──────────────────────────────────
    if (!absent || collection.noShowPackAction === 'consume') {
      const punch = await consumePackCredit({
        organizationId,
        studentId,
        lessonId,
        lessonType,
        lessonDate,
        kind: wantKind,
      })
      if (punch.outcome !== 'none') {
        if (punch.outcome === 'consumed' && punch.packId) {
          consumedPackIds.push(punch.packId)
          options.onPackConsumed?.(punch.packId)
        }
        await writeAbsence(entry, absent ? 0 : null, absent ? 'pack' : null)
        continue
      }
    }

    const resolved = resolveLessonBaseAmount(
      {
        lessonType,
        pricePerStudent: (lesson.price_per_student as number | null) ?? null,
        durationMinutes,
        teacherHourlyRate: teacher?.hourly_rate ?? null,
        studentHourlyRate: toStudentPricing(entry.students ?? null).hourlyRate,
        studentDiscountPercent: toStudentPricing(entry.students ?? null).discountPercent,
      },
      pricing
    )
    const decision = priceOutcome({
      absent,
      coveredBySubscription: false,
      packAvailable: false,
      baseAmount: isMissingPrice(resolved) ? null : resolved,
      noShowChargePercent: collection.noShowChargePercent,
      noShowPackAction: collection.noShowPackAction,
    })

    if (absent) await writeAbsence(entry, decision.record === 'charge' ? decision.amount : 0, null)

    if (decision.record !== 'charge') {
      if (decision.record === 'none' && decision.reason === 'missing_rate' && perLesson && isMissingPrice(resolved)) {
        console.error('[settleLessonOutcome] cannot price lesson', { lessonId, organizationId, lessonType, missing: resolved.missing.field })
        alerts.push(
          resolved.missing.field === 'hourly_rate'
            ? { type: 'missing_rate', message: 'validation.noTeacherRate' }
            : { type: 'missing_price', message: 'validation.noLessonPrice' }
        )
      }
      continue
    }
    // Monthly: the engine bills this lesson from the same inputs.
    if (!perLesson) continue

    let parentId: string
    try {
      parentId = await resolveBillingParent(studentId, organizationId)
    } catch (e) {
      if (e instanceof MissingPrimaryParentError) {
        alerts.push({ type: 'missing_parent', message: 'validation.noPrimaryParent' })
        continue
      }
      throw e
    }

    const { data: inserted, error: insertError } = await db
      .from('charges')
      .insert({
        organization_id: organizationId,
        parent_id: parentId,
        student_id: studentId,
        lesson_id: lessonId,
        amount: decision.amount,
        charge_type: decision.chargeType,
        status: 'pending',
        due_date: dueDate,
      })
      .select('id')
      .single()

    if (insertError) {
      // 23505 = a concurrent settlement wrote the same (lesson, student) charge.
      if (insertError.code !== '23505') {
        console.error('[settleLessonOutcome] insert error', { lessonId, organizationId, studentId, error: insertError.message })
        alerts.push({ type: 'error', message: 'validation.createChargeFailed' })
      }
      continue
    }

    await logChargeAudit({
      organizationId,
      chargeId: inserted.id as string,
      parentId,
      eventType: 'created',
      actorProfileId: actor,
      afterStatus: 'pending',
      afterAmount: decision.amount,
      metadata: {
        source: absent ? 'lesson_no_show' : 'lesson_completed',
        lesson_id: lessonId,
        student_id: studentId,
      },
    })
  }

  // "Running low" / "used up" to the parent, when the org opted in (M2).
  // Never throws.
  await notifyPackBalances(organizationId, consumedPackIds)

  // The conflict is the one the tutor must act on, so it is reported first.
  return alerts.find((a) => a.type === 'outcome_conflict') ?? alerts[0] ?? null
}
