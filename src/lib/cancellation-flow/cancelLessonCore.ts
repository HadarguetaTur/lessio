/**
 * The one place a lesson gets cancelled.
 *
 * Cancellation used to be implemented six times — the owner/admin panel, the
 * teacher's cancel, the parent portal, the WhatsApp bot, the status dropdown and
 * the series stop — and the six disagreed about nearly everything that costs
 * money: whether a delivered lesson could be cancelled a second time, whether a
 * teacher's cancellation carried a fee, which parent was billed, whether the
 * whole roster of a group lesson was covered, and whether the org's policy
 * applied at all in monthly-billing orgs.
 *
 * Every entry point now calls `cancelLessonCore`, and it owns the whole rule:
 *
 *   actor → roster → billing parent → policy → billable amount → billing mode
 *         → lesson-state validity → idempotency → event/charge → what to say
 *
 * The last step is not decoration. `lines` describes what actually landed in
 * the database, and callers must build the parent's confirmation from it — the
 * WhatsApp bot used to quote a fee computed separately from the one it billed,
 * and in monthly orgs it quoted a fee it had not billed at all.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createCancellationCharge, type ChargeAlert } from '@/lib/billing/createCharge'
import type { CancellationChargeResult } from '@/lib/billing/calculateCancellationCharge'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { getOrgTimezone } from '@/lib/organizations'
import { toStudentPricing } from '@/lib/billing/lessonPricing'
import { resolveBillingParent, MissingPrimaryParentError } from '@/lib/billing/resolveBillingParent'
import { getCancellationPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { getOrgBillingPolicy, type BillingMode } from '@/lib/billing/orgBillingPolicy'
import { createCancellationEvent } from '@/lib/billing/monthly/cancellationEvents'
import { previewCancellationCharge, isCancellableByParent } from './previewCancellationCharge'

/** Who is cancelling. Decides what may be waived and what must be re-checked. */
export type CancellationActor =
  /** Owner or admin. The only actor allowed to waive the fee. */
  | { kind: 'staff' }
  /** A teacher cancelling her own lesson. The org policy applies in full. */
  | { kind: 'teacher'; teacherId: string }
  /** A parent, through the portal or the WhatsApp bot. */
  | { kind: 'parent'; parentId: string }

export type CancellationSource = 'dashboard' | 'teacher' | 'portal' | 'whatsapp'

export const CANCEL_REASON: Record<CancellationSource, string> = {
  dashboard: 'CANCELLED_BY_STAFF',
  teacher: 'CANCELLED_BY_TEACHER',
  portal: 'CANCELLED_VIA_PORTAL',
  whatsapp: 'CANCELLED_VIA_WHATSAPP',
}

export type CancellationError =
  | 'not_found'
  | 'already_cancelled'
  /** The lesson was delivered — completed or a no-show. Cancelling it would
   *  either double-charge the family or erase a lesson they already had. */
  | 'already_delivered'
  | 'not_eligible'
  | 'forbidden'
  | 'no_students'

/** What was recorded for one enrolled student. */
export interface CancellationLine {
  studentId: string
  studentName: string
  /** The student's PRIMARY parent — who owes the fee, not who clicked cancel. */
  billingParentId: string | null
  amount: number
  chargeType: 'full' | 'partial' | null
  reasonCode: string
  /**
   * What actually happened in the database.
   *   'charge'  — a pending charge row exists now, per-lesson billing.
   *   'event'   — a cancellation event was written; the fee reaches the family
   *               on the monthly bill, and only once an admin confirms it.
   *   'none'    — nothing is owed (waived, outside the notice window, or the
   *               fee could not be attributed to a billing parent).
   */
  recorded: 'charge' | 'event' | 'none'
}

export interface CancellationSuccess {
  success: true
  billingMode: BillingMode
  lessonId: string
  lessonStartAt: string
  lessonEndAt: string
  /** The first enrolled student, for the single-student wording callers use. */
  studentName: string
  teacherName: string
  lines: CancellationLine[]
  /**
   * Money the family owes NOW, as rows in `charges`. Zero in monthly-billing
   * orgs even when a fee applies — there the fee is `pendingTotal` until an
   * admin confirms it onto the monthly bill.
   */
  billedTotal: number
  /** Fee recorded against a future monthly bill, awaiting admin confirmation. */
  pendingTotal: number
  /** The single-student view of `billedTotal`, for existing callers. */
  chargeResult: CancellationChargeResult
  alerts: ChargeAlert[]
}

export interface CancellationFailure {
  success: false
  error: CancellationError
}

export type CancellationOutcome = CancellationSuccess | CancellationFailure

const NO_CHARGE: CancellationChargeResult = {
  shouldCharge: false,
  chargeType: null,
  amount: 0,
  reasonCode: 'no_charge',
}

interface RosterRow {
  student_id: string
  students?: {
    full_name?: string | null
    hourly_rate: number | null
    discount_percent: number | null
  } | null
}

export interface CancelLessonInput {
  lessonId: string
  orgId: string
  actor: CancellationActor
  source: CancellationSource
  /** Free-text reason. Falls back to the source's canonical marker. */
  reason?: string
  /** Owner/admin only; ignored for every other actor. */
  waive?: boolean
  actorProfileId?: string
  now?: Date
}

export async function cancelLessonCore(input: CancelLessonInput): Promise<CancellationOutcome> {
  const { lessonId, orgId, actor, source } = input
  const now = input.now ?? new Date()
  const db = createServiceRoleClient()

  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    // One literal: the select-string parser only types a literal, and a
    // concatenation degrades every field below to `GenericStringError`.
    .select(
      'id, start_at, end_at, status, lesson_type, price_per_student, lesson_students(student_id, students(full_name, hourly_rate, discount_percent)), teachers(id, hourly_rate, profiles(full_name))'
    )
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .single()

  if (lessonError || !lesson) return { success: false, error: 'not_found' }

  // ── Lesson state ──────────────────────────────────────────────────────────
  // A delivered lesson is not cancellable. Letting it through added a second,
  // full-price cancellation charge on top of the lesson charge already raised
  // when it was completed (the negative hours-left of a past lesson falls
  // straight into the full-charge branch), and in monthly orgs it did the
  // opposite: the delivered lesson stopped being 'completed' and fell off the
  // bill, so the family paid nothing for a lesson they had.
  if (lesson.status === 'cancelled') return { success: false, error: 'already_cancelled' }
  if (lesson.status === 'completed' || lesson.status === 'no_show') {
    return { success: false, error: 'already_delivered' }
  }
  if (lesson.status !== 'scheduled') return { success: false, error: 'not_eligible' }

  const roster = (lesson.lesson_students as unknown as RosterRow[]) ?? []
  if (roster.length === 0) return { success: false, error: 'no_students' }

  const teacher = lesson.teachers as unknown as {
    id: string
    hourly_rate: number | null
    profiles?: { full_name?: string | null } | null
  } | null

  // ── Actor ─────────────────────────────────────────────────────────────────
  if (actor.kind === 'teacher') {
    if (!teacher || teacher.id !== actor.teacherId) return { success: false, error: 'forbidden' }
  }

  if (actor.kind === 'parent') {
    const { data: rel } = await db
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .eq('parent_id', actor.parentId)
      .in('student_id', roster.map((r) => r.student_id))
      .limit(1)
      .maybeSingle()

    if (!rel) return { success: false, error: 'forbidden' }
    if (!isCancellableByParent(lesson.start_at as string, now)) {
      return { success: false, error: 'not_eligible' }
    }
  }

  // Waiving the fee is a money decision, so it stays with owner/admin.
  const waive = actor.kind === 'staff' && input.waive === true

  // ── Policy ────────────────────────────────────────────────────────────────
  // The policy is read with the service role on purpose. The RLS-bound reader
  // returns null for a teacher (no SELECT policy on cancellation_policies), for
  // the portal and for the webhook, and a null policy reads as "cancelling is
  // free" — a teacher's cancellation silently waived every fee.
  const [pricing, policy, billing, timezone] = await Promise.all([
    getOrgPricing(orgId),
    getCancellationPolicyServiceRole(orgId),
    getOrgBillingPolicy(orgId),
    getOrgTimezone(orgId),
  ])

  const priceFor = (row: RosterRow): CancellationChargeResult =>
    waive
      ? { ...NO_CHARGE, reasonCode: 'waived' }
      : previewCancellationCharge(
          {
            start_at: lesson.start_at as string,
            end_at: lesson.end_at as string,
            lesson_type: (lesson.lesson_type as string | null) ?? null,
            price_per_student: (lesson.price_per_student as number | null) ?? null,
            teacherHourlyRate: teacher?.hourly_rate ?? null,
            studentPricing: toStudentPricing(row.students ?? null),
          },
          now,
          pricing,
          policy
        )

  // Priced before the lesson is touched: a failure here must not leave a
  // cancelled lesson that nobody was billed for.
  const priced = roster.map((row) => ({ row, charge: priceFor(row) }))

  // ── Claim ─────────────────────────────────────────────────────────────────
  // The status guard is the idempotency key. Two cancels racing each other —
  // the parent tapping twice, the portal and the bot at once — both used to
  // pass the read-then-write check above and each write its own financial
  // record. Only the update that actually moves the row off 'scheduled' wins.
  const { data: claimed, error: claimError } = await db
    .from('lessons')
    .update({
      status: 'cancelled',
      cancel_reason: input.reason?.trim() || CANCEL_REASON[source],
      cancelled_at: now.toISOString(),
      cancelled_by_profile_id: input.actorProfileId ?? null,
      cancellation_source: actor.kind === 'teacher' ? 'teacher' : actor.kind === 'parent' ? source : 'staff',
      updated_at: now.toISOString(),
    })
    .eq('id', lessonId)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .select('id')

  if (claimError) {
    throw new Error(`[cancelLessonCore] failed to cancel lesson: ${claimError.message}`)
  }
  if (!claimed || claimed.length === 0) return { success: false, error: 'already_cancelled' }

  // ── Record ────────────────────────────────────────────────────────────────
  const alerts: ChargeAlert[] = []
  const lines: CancellationLine[] = []

  for (const { row, charge } of priced) {
    const studentName = row.students?.full_name ?? '—'
    const base: CancellationLine = {
      studentId: row.student_id,
      studentName,
      billingParentId: null,
      amount: 0,
      chargeType: null,
      reasonCode: charge.reasonCode,
      recorded: 'none',
    }

    // The monthly engine needs the event whether or not a fee applies: it is the
    // record that this lesson was cancelled, and it carries the policy's number
    // so a monthly org bills the same fee a per-lesson org does.
    if (billing.billingMode === 'monthly') {
      try {
        await createCancellationEvent({
          organizationId: orgId,
          lessonId,
          studentId: row.student_id,
          lessonStartAt: lesson.start_at as string,
          timezone,
          charge,
          cancelledAt: now,
        })
        const chargeable = charge.shouldCharge && charge.amount > 0
        lines.push({
          ...base,
          amount: chargeable ? charge.amount : 0,
          chargeType: chargeable ? charge.chargeType : null,
          recorded: chargeable ? 'event' : 'none',
        })
      } catch (err) {
        console.error('[cancelLessonCore] cancellation event failed', {
          lessonId,
          studentId: row.student_id,
          err,
        })
        alerts.push({ type: 'error', message: 'validation.createCancellationChargeFailed' })
        lines.push(base)
      }
      continue
    }

    if (!charge.shouldCharge || charge.amount <= 0) {
      if (charge.reasonCode === 'missing_rate') {
        alerts.push({ type: 'missing_rate', message: 'validation.noTeacherRate' })
      }
      lines.push(base)
      continue
    }

    let billingParentId: string
    try {
      // The fee follows the student's primary parent. The parent-initiated
      // paths used to bill whoever tapped cancel, so a secondary parent's
      // cancellation landed on the wrong ledger.
      billingParentId = await resolveBillingParent(row.student_id, orgId)
    } catch (e) {
      if (e instanceof MissingPrimaryParentError) {
        alerts.push({ type: 'missing_parent', message: 'validation.noPrimaryParent' })
        lines.push(base)
        continue
      }
      throw e
    }

    const alert = await createCancellationCharge(
      lessonId,
      orgId,
      billingParentId,
      charge,
      row.student_id
    )
    if (alert) {
      alerts.push(alert)
      lines.push({ ...base, billingParentId })
      continue
    }

    lines.push({
      ...base,
      billingParentId,
      amount: charge.amount,
      chargeType: charge.chargeType,
      recorded: 'charge',
    })
  }

  const billedTotal = round2(sum(lines.filter((l) => l.recorded === 'charge').map((l) => l.amount)))
  const pendingTotal = round2(sum(lines.filter((l) => l.recorded === 'event').map((l) => l.amount)))

  // The single-student view every existing caller renders from. It reports what
  // was BILLED, so a monthly org — where the fee is pending an admin's
  // confirmation, not charged — quotes the family nothing.
  const billedLine = lines.find((l) => l.recorded === 'charge')

  return {
    success: true,
    billingMode: billing.billingMode,
    lessonId,
    lessonStartAt: lesson.start_at as string,
    lessonEndAt: lesson.end_at as string,
    studentName: roster[0]?.students?.full_name ?? '—',
    teacherName: teacher?.profiles?.full_name ?? '—',
    lines,
    billedTotal,
    pendingTotal,
    chargeResult: billedLine
      ? {
          shouldCharge: true,
          chargeType: billedLine.chargeType,
          amount: billedTotal,
          reasonCode: billedLine.reasonCode,
        }
      : { ...NO_CHARGE, reasonCode: pendingTotal > 0 ? 'monthly_pending' : 'no_charge' },
    alerts,
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
