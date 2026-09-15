'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const policySchema = z.object({
  id: z.string().uuid().optional(),
  teacherId: z.string().uuid().nullable(),
  model: z.enum(['hourly', 'fixed_per_lesson', 'percentage_revenue', 'base_plus_participant']),
  baseRateType: z.enum(['hourly', 'fixed_per_lesson']).nullable(),
  hourlyAmount: z.coerce.number().min(0).nullable(),
  fixedAmount: z.coerce.number().min(0).nullable(),
  revenuePercent: z.coerce.number().min(0).max(100).nullable(),
  participantAmount: z.coerce.number().min(0).nullable(),
  noShowPercent: z.coerce.number().min(0).max(100),
  lateParentCancellationPercent: z.coerce.number().min(0).max(100),
  requiresConfirmation: z.boolean(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

async function owner() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') throw new Error('FORBIDDEN')
  return session
}

export async function saveCompensationPolicy(formData: FormData): Promise<void> {
  const session = await owner()
  const parsed = policySchema.safeParse({
    id: formData.get('id') || undefined,
    teacherId: formData.get('teacher_id') || null,
    model: formData.get('model'),
    baseRateType: formData.get('base_rate_type') || null,
    hourlyAmount: formData.get('hourly_amount') || null,
    fixedAmount: formData.get('fixed_amount') || null,
    revenuePercent: formData.get('revenue_percent') || null,
    participantAmount: formData.get('participant_amount') || null,
    noShowPercent: formData.get('no_show_percent'),
    lateParentCancellationPercent: formData.get('late_parent_cancellation_percent'),
    requiresConfirmation: formData.get('requires_confirmation') === 'on',
    effectiveFrom: formData.get('effective_from'),
    effectiveTo: formData.get('effective_to') || null,
  })
  if (!parsed.success) throw new Error('INVALID_POLICY')

  const db = createServiceRoleClient()
  const effectiveFrom = `${parsed.data.effectiveFrom}T00:00:00.000Z`
  const effectiveTo = parsed.data.effectiveTo ? `${parsed.data.effectiveTo}T00:00:00.000Z` : null
  const values = {
    organization_id: session.orgId,
    teacher_id: parsed.data.teacherId,
    model: parsed.data.model,
    base_rate_type: parsed.data.baseRateType,
    hourly_amount: parsed.data.hourlyAmount,
    fixed_amount: parsed.data.fixedAmount,
    revenue_percent: parsed.data.revenuePercent,
    participant_amount: parsed.data.participantAmount,
    no_show_percent: parsed.data.noShowPercent,
    late_parent_cancellation_percent: parsed.data.lateParentCancellationPercent,
    requires_confirmation: parsed.data.requiresConfirmation,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    created_by_profile_id: session.profileId,
  }
  const query = parsed.data.id
    ? db.from('compensation_policies').update(values).eq('id', parsed.data.id).eq('organization_id', session.orgId).select('id').single()
    : db.from('compensation_policies').insert(values).select('id').single()
  const { data: saved, error } = await query
  if (error || !saved) throw new Error(error?.code === '23P01' ? 'POLICY_OVERLAP' : 'POLICY_SAVE_FAILED')

  await db.from('teacher_economics_audit_log').insert({
    organization_id: session.orgId,
    entity_type: 'policy',
    entity_id: saved.id,
    action: parsed.data.id ? 'updated' : 'created',
    actor_profile_id: session.profileId,
    after_values: values,
  })
  revalidatePath('/settings/teacher-economics')
}

export async function saveTeacherEstimateVisibility(formData: FormData): Promise<void> {
  const session = await owner()
  const db = createServiceRoleClient()
  const { error } = await db.from('organizations').update({ teacher_estimates_enabled: formData.get('enabled') === 'on' }).eq('id', session.orgId)
  if (error) throw new Error('VISIBILITY_SAVE_FAILED')
  revalidatePath('/settings/teacher-economics')
}
