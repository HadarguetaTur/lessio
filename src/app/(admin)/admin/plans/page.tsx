import { requirePlatformSession } from '@/lib/superadmin/session'
import { getLocale, getTranslations } from 'next-intl/server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseSaasFeatures, type SaasFeatures, type SaasPlanName } from '@/lib/saas/types'
import { PageHeader } from '@/components/ui/page-header'
import { PlanEditorCard, type EditablePlan } from '@/components/admin/PlanEditorCard'
import { updatePlanAction } from './actions'

/**
 * Plan and quota editor.
 *
 * Per /docs/sprint-34-scope.md § /admin/plans. Reads inactive plans too —
 * listActiveSaasPlans() deliberately hides them from tenants, but the screen
 * that turns a plan back on has to be able to see it.
 */

type PlanQueryRow = {
  id: string
  name: string
  display_name_he: string
  display_name_en: string
  price_monthly: number | string
  price_yearly: number | string | null
  features: unknown
  students_quota: number | null
  lessons_monthly_quota: number | null
  teachers_quota: number | null
  is_active: boolean
  sort_order: number
}

export default async function AdminPlansPage() {
  await requirePlatformSession('billing.read')

  const t = await getTranslations('admin.plans')
  const locale = await getLocale()
  const db = createServiceRoleClient()

  const [plansRes, subsRes] = await Promise.all([
    db
      .from('saas_plans')
      .select(
        'id, name, display_name_he, display_name_en, price_monthly, price_yearly, features, students_quota, lessons_monthly_quota, teachers_quota, is_active, sort_order'
      )
      .order('sort_order', { ascending: true }),
    db.from('organization_subscriptions').select('plan_id'),
  ])

  const counts = new Map<string, number>()
  for (const row of (subsRes.data ?? []) as { plan_id: string }[]) {
    counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1)
  }

  const plans: EditablePlan[] = ((plansRes.data ?? []) as unknown as PlanQueryRow[]).map(
    (p) => ({
      id: p.id,
      name: p.name as SaasPlanName,
      label: locale === 'he' ? p.display_name_he : p.display_name_en,
      priceMonthly: Number(p.price_monthly),
      priceYearly: p.price_yearly != null ? Number(p.price_yearly) : null,
      studentsQuota: p.students_quota,
      lessonsMonthlyQuota: p.lessons_monthly_quota,
      teachersQuota: p.teachers_quota,
      isActive: p.is_active,
      features: parseSaasFeatures(p.features) as SaasFeatures,
      subscriberCount: counts.get(p.id) ?? 0,
    })
  )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <p className="mb-5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t('priceChangeNote')}
      </p>

      <div className="space-y-4">
        {plans.map((plan) => (
          <PlanEditorCard key={plan.id} plan={plan} action={updatePlanAction} />
        ))}
      </div>
    </div>
  )
}
