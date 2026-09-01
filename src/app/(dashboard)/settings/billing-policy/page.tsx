import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES } from '@/lib/billing/lessonPricing'
import type { LessonType } from '@/lib/lessons/types'
import { BillingPolicyForm } from './BillingPolicyForm'

/**
 * Billing policy settings — org-level rules for what a student is charged for.
 * Owner only, like /settings/pricing: this moves money.
 */
export default async function BillingPolicySettingsPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.billingPolicy')

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('subscription_covered_lesson_types, billing_mode, billing_cycle_start_day, billing_due_days')
    .eq('id', orgId)
    .single()

  const covered =
    (org as { subscription_covered_lesson_types: LessonType[] | null } | null)
      ?.subscription_covered_lesson_types ?? [...DEFAULT_SUBSCRIPTION_COVERED_LESSON_TYPES]

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <BillingPolicyForm
          defaultCoveredTypes={covered}
          defaultBillingMode={org?.billing_mode === 'per_lesson' ? 'per_lesson' : 'monthly'}
          defaultCycleStartDay={Number(org?.billing_cycle_start_day ?? 1)}
          defaultDueDays={Number(org?.billing_due_days ?? 7)}
        />
      </div>
    </div>
  )
}
