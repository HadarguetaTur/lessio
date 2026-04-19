import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgSubscriptionState } from '@/lib/saas/subscriptions'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PageHeader } from '@/components/ui/page-header'
import { saveDataRetentionAction } from './actions'
import { DataRetentionForm } from './DataRetentionForm'

/**
 * Privacy / Data Retention settings — owner only, Advanced/Custom plan.
 * Per /docs/sprint-23-scope.md § Story 1c.
 */
export default async function PrivacySettingsPage() {
  const { role, orgId } = await getSession()
  if (role !== 'owner') redirect('/settings')

  const [sub, orgRow] = await Promise.all([
    getOrgSubscriptionState(orgId),
    createServiceRoleClient()
      .from('organizations')
      .select('data_retention_days')
      .eq('id', orgId)
      .single(),
  ])

  // Only Advanced/Custom plan owners see this UI — others silently use 365-day default
  const planName = sub?.planName ?? null
  const canCustomiseRetention = planName === 'advanced' || planName === 'custom' || !sub

  const currentDays = (orgRow.data as { data_retention_days: number | null } | null)?.data_retention_days ?? 365

  return (
    <div className="max-w-xl">
      <PageHeader
        title="פרטיות ושמירת נתונים"
        description="הגדר כמה זמן נשמרים נתוני הפעילות של הארגון"
      />

      {canCustomiseRetention ? (
        <DataRetentionForm currentDays={currentDays} action={saveDataRetentionAction} />
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            הגדרת מדיניות שמירת נתונים מותאמת זמינה בתוכניות Advanced ו-Custom בלבד.
            כרגע הנתונים נשמרים למשך 365 יום.
          </p>
        </div>
      )}
    </div>
  )
}
