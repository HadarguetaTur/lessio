'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSaasPlanById } from '@/lib/saas/plans'
import { recordAdminAction } from '@/lib/superadmin/audit'
import { DEFAULT_SAAS_FEATURES } from '@/lib/saas/types'

/**
 * Plan editing for /admin/plans.
 * Per /docs/sprint-34-scope.md § /admin/plans.
 *
 * `saas_plans` was read-only from the app: changing a price or a quota meant
 * writing SQL against production.
 */

export type PlanActionState = { error?: string; ok?: boolean }

const FEATURE_KEYS = Object.keys(DEFAULT_SAAS_FEATURES) as (keyof typeof DEFAULT_SAAS_FEATURES)[]

/** An empty numeric field means "unlimited", which is NULL — not zero. Zero is
 *  a real quota that blocks everything, and the two must not collapse. */
const optionalCount = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), 'INVALID_QUOTA')

const schema = z.object({
  planId: z.string().uuid(),
  priceMonthly: z.coerce.number().min(0).max(100000),
  priceYearly: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= 1000000), 'INVALID_PRICE'),
  studentsQuota: optionalCount,
  lessonsMonthlyQuota: optionalCount,
  isActive: z.enum(['on', 'off']),
})

export async function updatePlanAction(
  _prev: PlanActionState | null,
  formData: FormData
): Promise<PlanActionState> {
  const { profileId } = await requirePlatformSession('billing.write')

  const parsed = schema.safeParse({
    planId: formData.get('planId'),
    priceMonthly: formData.get('priceMonthly'),
    priceYearly: formData.get('priceYearly') ?? '',
    studentsQuota: formData.get('studentsQuota') ?? '',
    lessonsMonthlyQuota: formData.get('lessonsMonthlyQuota') ?? '',
    isActive: formData.get('isActive') === 'on' ? 'on' : 'off',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'INVALID_INPUT' }
  }

  const before = await getSaasPlanById(parsed.data.planId)
  if (!before) return { error: 'PLAN_NOT_FOUND' }

  // Features come from one checkbox per key. Reading them off the plan's own
  // key list rather than off the form means a checkbox the browser omitted
  // (unchecked inputs are not submitted) reads as false instead of vanishing.
  const features: Record<string, boolean> = {}
  for (const key of FEATURE_KEYS) {
    features[key] = formData.get(`feature.${key}`) === 'on'
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('saas_plans')
    .update({
      price_monthly: parsed.data.priceMonthly,
      price_yearly: parsed.data.priceYearly,
      students_quota: parsed.data.studentsQuota,
      lessons_monthly_quota: parsed.data.lessonsMonthlyQuota,
      is_active: parsed.data.isActive === 'on',
      features,
    })
    .eq('id', parsed.data.planId)

  if (error) return { error: error.message }

  await recordAdminAction({
    actorProfileId: profileId,
    action: 'plan.update',
    targetType: 'saas_plans',
    targetId: parsed.data.planId,
    metadata: {
      plan: before.name,
      before: {
        priceMonthly: before.price_monthly,
        priceYearly: before.price_yearly,
        studentsQuota: before.students_quota,
        lessonsMonthlyQuota: before.lessons_monthly_quota,
        features: before.features,
      },
      after: {
        priceMonthly: parsed.data.priceMonthly,
        priceYearly: parsed.data.priceYearly,
        studentsQuota: parsed.data.studentsQuota,
        lessonsMonthlyQuota: parsed.data.lessonsMonthlyQuota,
        features,
      },
    },
  })

  revalidatePath('/admin/plans')
  revalidatePath('/admin/subscriptions')
  return { ok: true }
}
