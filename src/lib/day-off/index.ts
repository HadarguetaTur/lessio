/**
 * Teacher day-off requests: raised from the teacher's WhatsApp menu, decided
 * from the owner's.
 *
 * The whole point of the approval gate is that a teacher's tap does nothing on
 * its own. Only `approveDayOffRequest` moves anything, and when it does it does
 * three things at once: blocks the days so the booking WebView stops offering
 * them, cancels the lessons already in them, and tells every affected parent.
 *
 * The cancelling and the parent notices live in ./cancelForAbsence, shared with
 * the dashboard's partial-day blocks — including the two load-bearing rules
 * (never charge for a teacher's absence, and cancel only through the service
 * role). Read that file before touching either path.
 *
 * Everything here is called from the webhook, which already holds a decrypted
 * access token; a dashboard caller builds one with `buildSendContext`.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendReplyButtons } from '@/lib/whatsapp/interactive'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { botString } from '@/lib/whatsapp/strings'
import { encodeStaffRequestPayload, datesInRange, formatDateRange } from '@/lib/whatsapp/dayOffPayloads'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import {
  cancelLessons,
  loadAffectedLessons,
  notifyParents,
  type AbsenceWindow,
} from './cancelForAbsence'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'

type Db = ReturnType<typeof createServiceRoleClient>

const OVERRIDE_REASON = 'APPROVED_DAY_OFF'

export type DayOffRequest = {
  id: string
  organizationId: string
  teacherId: string
  startDate: string
  endDate: string
  status: 'pending' | 'approved' | 'rejected'
  teacherName: string | null
}

/** What the webhook needs to talk to Meta on the org's behalf. */
export type SendContext = {
  orgId: string
  accessToken: string
  phoneNumberId: string
  timezone: string
}

// ── Reads ─────────────────────────────────────────────────────────────────────

type RequestRow = {
  id: string
  organization_id: string
  teacher_id: string
  start_date: string
  end_date: string
  status: string
  teachers: { profiles: { full_name: string | null } | null } | null
}

const REQUEST_SELECT = 'id, organization_id, teacher_id, start_date, end_date, status, teachers ( profiles ( full_name ) )'

function toRequest(row: RequestRow): DayOffRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    teacherId: row.teacher_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as DayOffRequest['status'],
    teacherName: row.teachers?.profiles?.full_name ?? null,
  }
}

/** Open requests for an org, oldest first. Capped to fit one WhatsApp list. */
export async function getPendingRequests(orgId: string, limit = 9): Promise<DayOffRequest[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('day_off_requests')
    .select(REQUEST_SELECT)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[day-off] Failed to list pending requests', { orgId, error })
    throw new Error('Failed to load pending day-off requests')
  }

  return ((data ?? []) as unknown as RequestRow[]).map(toRequest)
}

/**
 * One request, scoped to the org. This IS the authorisation check for a tapped
 * request id — reply ids are client-supplied, and an id from another org must
 * come back empty rather than be acted on.
 */
export async function getRequestById(orgId: string, requestId: string): Promise<DayOffRequest | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('day_off_requests')
    .select(REQUEST_SELECT)
    .eq('organization_id', orgId)
    .eq('id', requestId)
    .maybeSingle()

  if (error) {
    console.error('[day-off] Failed to load request', { orgId, requestId, error })
    return null
  }

  return data ? toRequest(data as unknown as RequestRow) : null
}

/** How many lessons an approval would cancel — shown to the owner before they decide. */
export async function countLessonsInRange(
  orgId: string,
  teacherId: string,
  startDate: string,
  endDate: string,
  timezone: string
): Promise<number> {
  const db = createServiceRoleClient()
  const { gte, lt } = rangeBounds(startDate, endDate, timezone)

  const { count, error } = await db
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', gte)
    .lt('start_at', lt)

  if (error) {
    console.error('[day-off] Lesson count failed', { orgId, teacherId, error })
    return 0
  }

  return count ?? 0
}

// ── Create ────────────────────────────────────────────────────────────────────

export type CreateResult =
  | { ok: true; request: DayOffRequest }
  | { ok: false; reason: 'already_pending' }

export async function createDayOffRequest(params: {
  orgId: string
  teacherId: string
  startDate: string
  endDate: string
}): Promise<CreateResult> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('day_off_requests')
    .insert({
      organization_id: params.orgId,
      teacher_id: params.teacherId,
      start_date: params.startDate,
      end_date: params.endDate,
    })
    .select(REQUEST_SELECT)
    .single()

  if (error) {
    // The partial unique index on (teacher_id) WHERE status='pending'. Two taps
    // of "send request" arrive as two deliveries; the second lands here.
    if (error.code === '23505') return { ok: false, reason: 'already_pending' }
    console.error('[day-off] Failed to create request', { ...params, error })
    throw new Error('Failed to create day-off request')
  }

  return { ok: true, request: toRequest(data as unknown as RequestRow) }
}

/**
 * Tells every owner and admin a request is waiting.
 *
 * The WhatsApp buttons are best-effort on purpose: a staff member who has not
 * written to the business number in 24h has a closed session window, and Meta
 * rejects free-form interactive messages there (131047). The in-app
 * notification always goes out, and the bot's "בקשות ממתינות" menu row is the
 * reliable way in — an owner writing to the bot opens the window themselves.
 */
export async function notifyStaffOfRequest(
  request: DayOffRequest,
  ctx: SendContext,
  lessonCount: number
): Promise<void> {
  const db = createServiceRoleClient()
  const dateRange = formatDateRange(request.startDate, request.endDate, ctx.timezone)

  const { data: staff, error } = await db
    .from('profiles')
    .select('id, phone, preferred_locale')
    .eq('organization_id', ctx.orgId)
    .in('role', ['owner', 'admin'])
    .eq('is_active', true)
    .not('phone', 'is', null)

  if (error) {
    console.error('[day-off] Could not load staff to notify', { orgId: ctx.orgId, error })
  }

  type StaffRow = { id: string; phone: string | null; preferred_locale: string | null }

  for (const row of (staff ?? []) as StaffRow[]) {
    if (!row.phone) continue
    const locale = parseAppLocale(row.preferred_locale ?? undefined)

    try {
      await sendReplyButtons(
        row.phone,
        {
          body: botString('staff_day_off_alert', locale, {
            teacher_name: teacherLabel(request, locale),
            date_range: dateRange,
            lessons: String(lessonCount),
          }),
          buttons: [
            { id: encodeStaffRequestPayload('approve', request.id), title: botString('staff_approve_button', locale) },
            { id: encodeStaffRequestPayload('reject', request.id), title: botString('staff_reject_button', locale) },
          ],
        },
        ctx.accessToken,
        ctx.phoneNumberId
      )
    } catch (err) {
      // Expected whenever their 24h window is closed; the in-app notification
      // below is the guaranteed channel.
      console.warn('[day-off] Staff WhatsApp alert failed — in-app notification still sent', {
        orgId: ctx.orgId,
        error: String(err),
      })
    }
  }

  try {
    const recipients = await getOwnerAndAdminProfileIds(ctx.orgId)
    // One title for several recipients, so it follows the org's language rather
    // than any single reader's.
    const { data: orgRow } = await db
      .from('organizations')
      .select('default_locale')
      .eq('id', ctx.orgId)
      .maybeSingle()
    const locale = parseAppLocale(orgRow?.default_locale ?? undefined)
    const tn = await getT('notifications', locale)
    await notifyMultiple(
      ctx.orgId,
      recipients,
      'day_off_requested',
      tn('dayOffRequested', { teacher: teacherLabel(request, locale) }),
      tn('dayOffRequestedBody', { range: dateRange, count: lessonCount }),
      '/teachers'
    )
  } catch (err) {
    console.error('[day-off] In-app staff notification failed', { orgId: ctx.orgId, err })
  }
}

// ── Decide ────────────────────────────────────────────────────────────────────

export type ApproveOutcome =
  | { status: 'approved'; request: DayOffRequest; lessonsCancelled: number; parentsNotified: number; parentsFailed: number }
  | { status: 'rejected'; request: DayOffRequest }
  | { status: 'already_decided' }
  | { status: 'not_found' }
  | { status: 'stale'; request: DayOffRequest }

/**
 * Approves a request and carries out everything it implies.
 *
 * The claim in step 2 is what makes two admins tapping approve at the same
 * moment safe: the guarded UPDATE only matches a row still `pending`, so the
 * loser gets `already_decided` and none of the side effects run twice.
 */
export async function approveDayOffRequest(params: {
  requestId: string
  decidedByProfileId: string
  ctx: SendContext
}): Promise<ApproveOutcome> {
  const { requestId, decidedByProfileId, ctx } = params
  const db = createServiceRoleClient()

  const existing = await getRequestById(ctx.orgId, requestId)
  if (!existing) return { status: 'not_found' }
  if (existing.status !== 'pending') return { status: 'already_decided' }

  // Dates already behind us: approving would cancel nothing and block days that
  // have passed. Close it rather than leave it open forever.
  const today = DateTime.now().setZone(ctx.timezone).startOf('day')
  const end = DateTime.fromFormat(existing.endDate, 'yyyy-MM-dd', { zone: ctx.timezone })
  if (end < today) {
    const claimed = await claimRequest(db, ctx.orgId, requestId, 'rejected', decidedByProfileId)
    if (!claimed) return { status: 'already_decided' }
    await notifyTeacherOfDecision(existing, ctx, 'rejected', 0)
    return { status: 'stale', request: existing }
  }

  const claimed = await claimRequest(db, ctx.orgId, requestId, 'approved', decidedByProfileId)
  if (!claimed) return { status: 'already_decided' }

  const request = existing

  let lessonsCancelled: number
  let notified: number
  let failed: number

  try {
    // 1. Block the days so the booking WebView stops offering slots. Checked by
    //    getAvailableSlots before the weekly availability rows.
    await blockDays(db, request, ctx.timezone)

    const window = absenceWindowFor(request, ctx.timezone)

    // 2. Read the affected lessons BEFORE cancelling — afterwards the status
    //    filter no longer matches them and the parents are unreachable.
    const affected = await loadAffectedLessons(db, window)

    // 3. Cancel. No charge and no cancellation event, by design.
    lessonsCancelled = await cancelLessons(db, window)

    // 4. Tell the parents.
    ;({ notified, failed } = await notifyParents(window, ctx, affected))
  } catch (err) {
    // The claim is already recorded, so a retry would come back
    // "already decided" and the owner would think their approval went through
    // while the lessons were never cancelled. Hand the request back rather than
    // leave it stranded in that state.
    await releaseClaim(db, ctx.orgId, requestId).catch((releaseErr) => {
      console.error('[day-off] Approval failed AND could not be reopened — needs a human', {
        orgId: ctx.orgId,
        requestId,
        releaseErr,
      })
    })
    throw err
  }

  await db
    .from('day_off_requests')
    .update({ lessons_cancelled: lessonsCancelled, parents_notified: notified })
    .eq('id', requestId)
    .eq('organization_id', ctx.orgId)

  await notifyTeacherOfDecision(request, ctx, 'approved', lessonsCancelled)

  console.info('[day-off] Request approved', {
    orgId: ctx.orgId,
    requestId,
    lessonsCancelled,
    parentsNotified: notified,
    parentsFailed: failed,
  })

  return { status: 'approved', request, lessonsCancelled, parentsNotified: notified, parentsFailed: failed }
}

export async function rejectDayOffRequest(params: {
  requestId: string
  decidedByProfileId: string
  ctx: SendContext
}): Promise<ApproveOutcome> {
  const { requestId, decidedByProfileId, ctx } = params
  const db = createServiceRoleClient()

  const existing = await getRequestById(ctx.orgId, requestId)
  if (!existing) return { status: 'not_found' }
  if (existing.status !== 'pending') return { status: 'already_decided' }

  const claimed = await claimRequest(db, ctx.orgId, requestId, 'rejected', decidedByProfileId)
  if (!claimed) return { status: 'already_decided' }

  await notifyTeacherOfDecision(existing, ctx, 'rejected', 0)

  console.info('[day-off] Request rejected', { orgId: ctx.orgId, requestId })
  return { status: 'rejected', request: existing }
}

// ── Internals ─────────────────────────────────────────────────────────────────

/** Guarded status transition. Returns false when someone else got there first. */
async function claimRequest(
  db: Db,
  orgId: string,
  requestId: string,
  status: 'approved' | 'rejected',
  decidedByProfileId: string
): Promise<boolean> {
  const { data, error } = await db
    .from('day_off_requests')
    .update({ status, decided_by: decidedByProfileId, decided_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    console.error('[day-off] Failed to claim request', { orgId, requestId, status, error })
    throw new Error('Failed to record the day-off decision')
  }

  return (data ?? []).length > 0
}

/**
 * Puts a claimed request back to pending after the work behind it failed, so
 * the next tap can genuinely redo it.
 */
async function releaseClaim(db: Db, orgId: string, requestId: string): Promise<void> {
  const { error } = await db
    .from('day_off_requests')
    .update({ status: 'pending', decided_by: null, decided_at: null })
    .eq('id', requestId)
    .eq('organization_id', orgId)

  if (error) throw new Error(`Failed to reopen day-off request: ${error.message}`)
}

/**
 * Blocks whole days for an approved day off.
 *
 * Delete-then-insert rather than an upsert: several override rows per date are
 * legal since partial-day blocks landed, so 'teacher_id,override_date' is no
 * longer a unique constraint an ON CONFLICT clause can name. It is also the
 * right semantics — an approved day off supersedes a blocked morning and any
 * special hours already set for that date. Whole-day is the strongest statement
 * the table can make; anything underneath it is noise.
 *
 * Not atomic: a crash between the two statements leaves the date with no
 * override at all. That is strictly better than a stale partial block, and the
 * caller reopens the request so the next approval redoes it.
 */
async function blockDays(db: Db, request: DayOffRequest, timezone: string): Promise<void> {
  const dates = datesInRange(request.startDate, request.endDate, timezone)
  if (dates.length === 0) return

  const { data: cleared, error: clearError } = await db
    .from('availability_overrides')
    .delete()
    .eq('organization_id', request.organizationId)
    .eq('teacher_id', request.teacherId)
    .in('override_date', dates)
    .select('id')

  if (clearError) {
    throw new Error(`Failed to clear existing overrides for an approved day off: ${clearError.message}`)
  }

  if ((cleared ?? []).length > 0) {
    // "My special hours vanished" is otherwise an unanswerable support ticket.
    console.info('[day-off] Replaced existing overrides', {
      requestId: request.id,
      replaced: (cleared ?? []).length,
    })
  }

  const { error } = await db.from('availability_overrides').insert(
    dates.map((date) => ({
      organization_id: request.organizationId,
      teacher_id: request.teacherId,
      override_date: date,
      is_available: false,
      reason: OVERRIDE_REASON,
    }))
  )

  // Throwing, where this used to only log. The caller wraps steps 1-4 and
  // reopens the claim on failure, and blocking runs BEFORE the cancellations —
  // so a throw here costs nothing, while swallowing it left the days bookable
  // after every parent had been told the teacher was away.
  if (error) {
    throw new Error(`Failed to block days for an approved day off: ${error.message}`)
  }
}

/** A whole-day day-off request, as the shared absence helpers see it. */
function absenceWindowFor(request: DayOffRequest, timezone: string): AbsenceWindow {
  const { gte, lt } = rangeBounds(request.startDate, request.endDate, timezone)
  return {
    orgId: request.organizationId,
    teacherId: request.teacherId,
    gte,
    lt,
    label: formatDateRange(request.startDate, request.endDate, timezone),
    teacherName: request.teacherName,
  }
}

/** UTC bounds for a whole-day range expressed in the org's timezone. */
function rangeBounds(startDate: string, endDate: string, timezone: string): { gte: string; lt: string } {
  const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: timezone }).startOf('day')
  const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: timezone }).plus({ days: 1 }).startOf('day')
  return { gte: start.toUTC().toISO()!, lt: end.toUTC().toISO()! }
}

async function notifyTeacherOfDecision(
  request: DayOffRequest,
  ctx: SendContext,
  decision: 'approved' | 'rejected',
  lessonsCancelled: number
): Promise<void> {
  const db = createServiceRoleClient()
  const dateRange = formatDateRange(request.startDate, request.endDate, ctx.timezone)

  const { data } = await db
    .from('teachers')
    .select('profiles ( phone, preferred_locale )')
    .eq('id', request.teacherId)
    .maybeSingle()

  const profile = (data as { profiles: { phone: string | null; preferred_locale: string | null } | null } | null)
    ?.profiles

  // The teacher reads both the WhatsApp message and the in-app notification.
  const locale = parseAppLocale(profile?.preferred_locale ?? undefined)

  if (profile?.phone) {
    try {
      // A decision can land days after the teacher last wrote in, so this goes
      // through the window-aware sender rather than plain text.
      await sendSmartMessage({
        orgId: ctx.orgId,
        phone: profile.phone,
        accessToken: ctx.accessToken,
        phoneNumberId: ctx.phoneNumberId,
        templateType: 'day_off_decision',
        vars: {
          date_range: dateRange,
          decision: botString(decision === 'approved' ? 'decision_approved' : 'decision_rejected', locale),
          lessons: String(lessonsCancelled),
        },
        locale,
      })
    } catch (err) {
      console.error('[day-off] Failed to tell the teacher the decision', {
        orgId: ctx.orgId,
        requestId: request.id,
        err,
      })
    }
  }

  try {
    const profileId = await getTeacherProfileId(request.teacherId)
    if (profileId) {
      const tn = await getT('notifications', locale)
      await notifyMultiple(
        ctx.orgId,
        [profileId],
        'day_off_decided',
        decision === 'approved' ? tn('dayOffApproved') : tn('dayOffRejected'),
        dateRange,
        '/teacher/schedule'
      )
    }
  } catch (err) {
    console.error('[day-off] In-app teacher notification failed', { orgId: ctx.orgId, err })
  }
}

/** The teacher's name, or the generic noun when the profile has none. */
function teacherLabel(request: DayOffRequest, locale: AppLocale): string {
  return request.teacherName?.trim() || botString('the_teacher', locale)
}
