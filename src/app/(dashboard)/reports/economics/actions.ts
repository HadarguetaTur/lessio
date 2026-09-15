'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { canPublishEconomics } from '@/lib/auth/roles'
import { getOrgTimezone } from '@/lib/organizations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/)
const adjustmentSchema = z.object({
  snapshotId: z.string().uuid(),
  lessonId: z.string().uuid().nullable(),
  beforeValues: z.string().min(2).max(4000),
  afterValues: z.string().min(2).max(4000),
  reason: z.string().trim().min(1).max(1000),
})

async function ownerSession() {
  const session = await getSession()
  requireMutation(session)
  if (!canPublishEconomics(session.role)) throw new Error('FORBIDDEN')
  return session
}

export async function publishMonthlySnapshotAction(formData: FormData): Promise<void> {
  const session = await ownerSession()
  const parsed = monthSchema.safeParse(formData.get('month'))
  if (!parsed.success) throw new Error('INVALID_MONTH')
  const month = parsed.data
  const db = createServiceRoleClient()
  const { data: existing } = await db
    .from('teacher_economics_snapshots')
    .select('id, status')
    .eq('organization_id', session.orgId)
    .eq('month', `${month}-01`)
    .maybeSingle()
  if (existing?.status === 'published') throw new Error('SNAPSHOT_PUBLISHED')

  const { data: snapshot, error: snapshotError } = await db
    .from('teacher_economics_snapshots')
    .upsert({ organization_id: session.orgId, month: `${month}-01`, status: 'draft' }, { onConflict: 'organization_id,month' })
    .select('id')
    .single()
  if (snapshotError || !snapshot) throw new Error('SNAPSHOT_FAILED')

  await db.from('teacher_economics_snapshot_lines').delete().eq('snapshot_id', snapshot.id).eq('organization_id', session.orgId)
  const timezone = await getOrgTimezone(session.orgId)
  const reports = await getOwnerTeacherEconomicsReport(session.orgId, month, timezone)
  const lines = reports.flatMap((report) => report.estimateLines.map((line) => ({
    organization_id: session.orgId,
    snapshot_id: snapshot.id,
    lesson_id: line.lessonId,
    teacher_id: line.teacherId,
    policy_id: line.policyId,
    policy_snapshot: line.policySnapshot ?? {},
    outcome: line.outcome,
    duration_minutes: line.durationHours * 60,
    enrolled_student_count: line.enrolledStudentCount,
    attributed_revenue: line.attributedRevenue,
    estimated_compensation: line.estimatedCompensation ?? 0,
    contribution: line.contribution ?? 0,
    confirmation_state: line.confirmationState,
  })))
  if (lines.length > 0) {
    const { error } = await db.from('teacher_economics_snapshot_lines').insert(lines)
    if (error) throw new Error('SNAPSHOT_LINES_FAILED')
  }
  const { error: publishError } = await db
    .from('teacher_economics_snapshots')
    .update({ status: 'published', published_at: new Date().toISOString(), published_by_profile_id: session.profileId })
    .eq('id', snapshot.id)
    .eq('organization_id', session.orgId)
  if (publishError) throw new Error('SNAPSHOT_PUBLISH_FAILED')
  await db.from('teacher_economics_audit_log').insert({
    organization_id: session.orgId,
    entity_type: 'snapshot',
    entity_id: snapshot.id,
    action: 'published',
    actor_profile_id: session.profileId,
    after_values: { month, lineCount: lines.length },
  })
  revalidatePath('/reports/economics')
}

export async function reopenMonthlySnapshotAction(formData: FormData): Promise<void> {
  const session = await ownerSession()
  const parsed = monthSchema.safeParse(formData.get('month'))
  if (!parsed.success) throw new Error('INVALID_MONTH')
  const db = createServiceRoleClient()
  const { data: snapshot } = await db
    .from('teacher_economics_snapshots')
    .select('id, status')
    .eq('organization_id', session.orgId)
    .eq('month', `${parsed.data}-01`)
    .maybeSingle()
  if (!snapshot || snapshot.status !== 'published') throw new Error('SNAPSHOT_NOT_PUBLISHED')
  const { error } = await db.from('teacher_economics_snapshots').update({ status: 'draft' }).eq('id', snapshot.id).eq('organization_id', session.orgId)
  if (error) throw new Error('SNAPSHOT_REOPEN_FAILED')
  await db.from('teacher_economics_audit_log').insert({
    organization_id: session.orgId,
    entity_type: 'snapshot',
    entity_id: snapshot.id,
    action: 'reopened',
    actor_profile_id: session.profileId,
    reason: String(formData.get('reason') ?? '').trim() || null,
  })
  revalidatePath('/reports/economics')
}

export async function recordEconomicsAdjustmentAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await ownerSession()
  const parsed = adjustmentSchema.safeParse({
    snapshotId: formData.get('snapshotId'),
    lessonId: formData.get('lessonId') || null,
    beforeValues: formData.get('beforeValues'),
    afterValues: formData.get('afterValues'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { ok: false, error: 'INVALID_ADJUSTMENT' }
  let beforeValues: unknown
  let afterValues: unknown
  try {
    beforeValues = JSON.parse(parsed.data.beforeValues)
    afterValues = JSON.parse(parsed.data.afterValues)
  } catch {
    return { ok: false, error: 'INVALID_ADJUSTMENT_VALUES' }
  }
  const db = createServiceRoleClient()
  const { data: snapshot } = await db.from('teacher_economics_snapshots').select('status').eq('id', parsed.data.snapshotId).eq('organization_id', session.orgId).single()
  if (snapshot?.status !== 'published') return { ok: false, error: 'SNAPSHOT_NOT_PUBLISHED' }
  const { error } = await db.from('teacher_economics_adjustments').insert({
    organization_id: session.orgId,
    snapshot_id: parsed.data.snapshotId,
    lesson_id: parsed.data.lessonId,
    actor_profile_id: session.profileId,
    before_values: beforeValues,
    after_values: afterValues,
    reason: parsed.data.reason,
  })
  if (error) return { ok: false, error: 'ADJUSTMENT_FAILED' }
  revalidatePath('/reports/economics')
  return { ok: true }
}

export async function decideEconomicsAdjustmentAction(formData: FormData): Promise<void> {
  const session = await ownerSession()
  const adjustmentId = z.string().uuid().parse(formData.get('adjustmentId'))
  const decision = z.enum(['accepted', 'rejected']).parse(formData.get('decision'))
  const reason = z.string().trim().min(1).max(1000).parse(formData.get('decisionReason'))
  const db = createServiceRoleClient()
  const { data: adjustment } = await db
    .from('teacher_economics_adjustments')
    .select('id, organization_id, snapshot_id, status, before_values, after_values')
    .eq('id', adjustmentId)
    .eq('organization_id', session.orgId)
    .single()
  if (!adjustment || adjustment.status !== 'pending') throw new Error('ADJUSTMENT_NOT_PENDING')
  const { error } = await db.from('teacher_economics_adjustments').update({
    status: decision,
    decision_reason: reason,
    decided_by_profile_id: session.profileId,
    decided_at: new Date().toISOString(),
  }).eq('id', adjustmentId).eq('organization_id', session.orgId).eq('status', 'pending')
  if (error) throw new Error('ADJUSTMENT_DECISION_FAILED')
  await db.from('teacher_economics_audit_log').insert({
    organization_id: session.orgId,
    entity_type: 'adjustment',
    entity_id: adjustmentId,
    action: decision,
    actor_profile_id: session.profileId,
    before_values: adjustment.before_values,
    after_values: adjustment.after_values,
    reason,
  })
  revalidatePath('/reports/economics')
}
