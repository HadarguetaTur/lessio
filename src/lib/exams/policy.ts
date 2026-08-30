/**
 * Exam policy engine — what happens when a parent/student reports an exam.
 *
 *   notify  — nothing beyond the teacher notification (default)
 *   approve — the teacher approves a weekly-quota bump with one click
 *   auto    — the bump is applied immediately for the exam week
 *
 * exam_offer_booster additionally sends the billing parent a booking link,
 * through sendSmartMessage, which is the opt-out and 24h-window enforcement
 * point.
 *
 * Called fire-and-forget after createExamReport — never throws.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { weekStartLocalDate } from '@/lib/booking/weeklyQuota'
import { decryptToken } from '@/lib/crypto'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { signBookingToken } from '@/lib/jwt'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { parseAppLocale } from '@/lib/i18n/locale'
import type { StudentExam } from '@/lib/students/exams'

export type ExamPolicyMode = 'notify' | 'approve' | 'auto'

export interface ExamPolicy {
  mode: ExamPolicyMode
  quotaBump: number
  offerBooster: boolean
}

export async function getExamPolicy(orgId: string): Promise<ExamPolicy> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('organizations')
    .select('exam_policy_mode, exam_quota_bump, exam_offer_booster')
    .eq('id', orgId)
    .maybeSingle()

  const row = data as {
    exam_policy_mode: ExamPolicyMode | null
    exam_quota_bump: number | null
    exam_offer_booster: boolean | null
  } | null

  return {
    mode: row?.exam_policy_mode ?? 'notify',
    quotaBump: row?.exam_quota_bump ?? 1,
    offerBooster: row?.exam_offer_booster ?? false,
  }
}

/**
 * The org-local Sunday of the week containing the exam date, keyed the same
 * way getWeeklyQuotaStatus reads overrides.
 */
export function examWeekStart(examDate: string, timezone: string): string {
  const local = DateTime.fromISO(examDate, { zone: timezone }).startOf('day')
  if (!local.isValid) throw new Error(`Invalid exam date: ${examDate}`)
  return weekStartLocalDate(local.toUTC().toISO()!, timezone)
}

/**
 * Creates (or raises) the quota override for the exam's week. Idempotent: an
 * existing override is only ever raised, never stacked or lowered.
 */
export async function upsertQuotaOverride(params: {
  orgId: string
  studentId: string
  weekStart: string
  extraLessons: number
  examId?: string
  createdBy?: string | null
}): Promise<void> {
  const db = createServiceRoleClient()

  const { data: existing } = await db
    .from('student_quota_overrides')
    .select('id, extra_lessons')
    .eq('student_id', params.studentId)
    .eq('week_start', params.weekStart)
    .maybeSingle()

  if (existing) {
    if ((existing.extra_lessons as number) >= params.extraLessons) return
    const { error } = await db
      .from('student_quota_overrides')
      .update({ extra_lessons: params.extraLessons })
      .eq('id', existing.id as string)
    if (error) throw new Error(`[exams/policy] Failed to raise override: ${error.message}`)
    return
  }

  const { error } = await db.from('student_quota_overrides').insert({
    organization_id: params.orgId,
    student_id: params.studentId,
    week_start: params.weekStart,
    extra_lessons: params.extraLessons,
    exam_id: params.examId ?? null,
    created_by: params.createdBy ?? null,
  })
  // A concurrent insert on the same (student, week) is fine — the other row won.
  if (error && !error.message.includes('student_quota_overrides_week_unique')) {
    throw new Error(`[exams/policy] Failed to create override: ${error.message}`)
  }
}

export async function applyExamPolicy(params: {
  orgId: string
  exam: StudentExam
}): Promise<void> {
  const { orgId, exam } = params
  try {
    const policy = await getExamPolicy(orgId)

    const db = createServiceRoleClient()
    const { data: orgRow } = await db
      .from('organizations')
      .select('timezone, enforce_weekly_quota, whatsapp_access_token, whatsapp_phone_number_id')
      .eq('id', orgId)
      .maybeSingle()
    const org = orgRow as {
      timezone: string | null
      enforce_weekly_quota: boolean
      whatsapp_access_token: string | null
      whatsapp_phone_number_id: string | null
    } | null
    const timezone = org?.timezone ?? 'Asia/Jerusalem'

    // The bump only means something where the weekly quota is enforced at all.
    if (policy.mode === 'auto' && org?.enforce_weekly_quota !== false) {
      await upsertQuotaOverride({
        orgId,
        studentId: exam.studentId,
        weekStart: examWeekStart(exam.examDate, timezone),
        extraLessons: policy.quotaBump,
        examId: exam.id,
      })
    }

    if (policy.offerBooster && org?.whatsapp_access_token && org?.whatsapp_phone_number_id) {
      await sendBoosterOffer({
        orgId,
        exam,
        accessToken: decryptToken(org.whatsapp_access_token),
        phoneNumberId: org.whatsapp_phone_number_id,
      })
    }
  } catch (err) {
    console.error('[exams/policy] applyExamPolicy failed', { orgId, examId: exam.id, err })
  }
}

/**
 * Offers the billing parent a booking link for an extra lesson before the
 * exam. sendSmartMessage handles opt-out and the 24h window.
 */
async function sendBoosterOffer(params: {
  orgId: string
  exam: StudentExam
  accessToken: string
  phoneNumberId: string
}): Promise<void> {
  const { orgId, exam } = params
  try {
    const db = createServiceRoleClient()
    const { data: rels } = await db
      .from('relationships')
      .select('parent_id, is_primary, parents ( phone, preferred_locale )')
      .eq('student_id', exam.studentId)
      .eq('organization_id', orgId)

    type RelRow = {
      parent_id: string
      is_primary: boolean | null
      parents: { phone: string | null; preferred_locale: string | null } | null
    }
    const rows = (rels ?? []) as unknown as RelRow[]
    const primary = rows.find((r) => r.is_primary) ?? rows[0]
    if (!primary?.parents?.phone) return

    const token = await signBookingToken({
      organizationId: orgId,
      parentId: primary.parent_id,
      studentId: exam.studentId,
    })

    await sendSmartMessage({
      orgId,
      phone: primary.parents.phone,
      accessToken: params.accessToken,
      phoneNumberId: params.phoneNumberId,
      templateType: 'booking_link',
      vars: { booking_url: `${getShareableBaseUrl()}/book/${token}` },
      locale: parseAppLocale(primary.parents.preferred_locale ?? undefined),
    })
  } catch (err) {
    console.warn('[exams/policy] Booster offer failed — skipping', {
      orgId,
      examId: exam.id,
      error: String(err),
    })
  }
}
