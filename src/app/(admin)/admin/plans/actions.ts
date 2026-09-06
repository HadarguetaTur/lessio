'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSaasPlanById } from '@/lib/saas/plans'
import { TRIAL_ENTITLEMENT_PLAN } from '@/lib/saas/planPresentation'
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
  teachersQuota: optionalCount,
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
    teachersQuota: formData.get('teachersQuota') ?? '',
    isActive: formData.get('isActive') === 'on' ? 'on' : 'off',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'INVALID_INPUT' }
  }

  const before = await getSaasPlanById(parsed.data.planId)
  if (!before) return { error: 'PLAN_NOT_FOUND' }

  const db = createServiceRoleClient()

  // A subscription stores no price — the plan row IS the price for every org
  // holding it. Editing a price on a subscribed plan would silently re-price
  // all of them at their next renewal, which contradicts the grandfathering
  // convention (see getSaasPlanById in @/lib/saas/plans): repricing means a
  // NEW plan row in a migration plus deactivating this one. A plan with zero
  // subscribers is fair game (pre-launch tuning).
  const priceChanged =
    parsed.data.priceMonthly !== before.price_monthly ||
    (parsed.data.priceYearly ?? null) !== (before.price_yearly ?? null)
  if (priceChanged) {
    const { count, error: countError } = await db
      .from('organization_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', parsed.data.planId)
    if (countError) return { error: countError.message }
    if ((count ?? 0) > 0) return { error: 'PRICE_CHANGE_ON_SUBSCRIBED_PLAN' }
  }

  // Deactivating the trial-entitlement plan makes getSaasPlanByName return null
  // for it, and the trial path treats null as "grant everything" — silently,
  // with no error and no failing test. This is the one deactivation that must
  // go through a migration and a deploy.
  if (before.name === TRIAL_ENTITLEMENT_PLAN && parsed.data.isActive === 'off') {
    return { error: 'TRIAL_PLAN_CANNOT_BE_DEACTIVATED' }
  }

  // Features come from one checkbox per key. Reading them off the plan's own
  // key list rather than off the form means a checkbox the browser omitted
  // (unchecked inputs are not submitted) reads as false instead of vanishing.
  const features: Record<string, boolean> = {}
  for (const key of FEATURE_KEYS) {
    features[key] = formData.get(`feature.${key}`) === 'on'
  }

  const { error } = await db
    .from('saas_plans')
    .update({
      price_monthly: parsed.data.priceMonthly,
      price_yearly: parsed.data.priceYearly,
      students_quota: parsed.data.studentsQuota,
      lessons_monthly_quota: parsed.data.lessonsMonthlyQuota,
      teachers_quota: parsed.data.teachersQuota,
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
        teachersQuota: before.teachers_quota,
        features: before.features,
      },
      after: {
        priceMonthly: parsed.data.priceMonthly,
        priceYearly: parsed.data.priceYearly,
        studentsQuota: parsed.data.studentsQuota,
        lessonsMonthlyQuota: parsed.data.lessonsMonthlyQuota,
        teachersQuota: parsed.data.teachersQuota,
        features,
      },
    },
  })

  revalidatePath('/admin/plans')
  revalidatePath('/admin/subscriptions')
  return { ok: true }
}
