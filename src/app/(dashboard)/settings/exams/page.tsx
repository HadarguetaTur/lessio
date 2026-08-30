import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ExamPolicyForm } from './ExamPolicyForm'

/**
 * Exam policy settings — what happens when a parent (portal) or student
 * (WhatsApp bot) reports an exam. Owner/admin only.
 */
export default async function ExamPolicySettingsPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.exams')

  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('exam_policy_mode, exam_quota_bump, exam_offer_booster, enforce_weekly_quota')
    .eq('id', orgId)
    .single()

  const row = org as {
    exam_policy_mode: 'notify' | 'approve' | 'auto' | null
    exam_quota_bump: number | null
    exam_offer_booster: boolean | null
    enforce_weekly_quota: boolean | null
  } | null

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <ExamPolicyForm
          defaultMode={row?.exam_policy_mode ?? 'notify'}
          defaultQuotaBump={row?.exam_quota_bump ?? 1}
          defaultOfferBooster={row?.exam_offer_booster ?? false}
          quotaEnforced={row?.enforce_weekly_quota ?? true}
        />
      </div>
    </div>
  )
}
