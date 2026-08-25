import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTranslations } from 'next-intl/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgPricing } from '@/lib/organizations/pricing'
import { PageHeader } from '@/components/ui/page-header'
import PricingForm from './PricingForm'

export default async function PricingSettingsPage() {
  const session = await getSession()
  if (session.role !== 'owner') redirect('/settings')

  const t = await getTranslations('settings.pricing')

  const pricing = await getOrgPricing(session.orgId)

  // How many teachers override the org rate — shown so the owner knows the
  // default is not the whole story.
  const db = createServiceRoleClient()
  const { count: teachersWithOwnRate } = await db
    .from('teachers')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', session.orgId)
    .not('hourly_rate', 'is', null)

  return (
    <div className="max-w-xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PricingForm
        initialData={{
          individualHourlyRate: pricing.individualHourlyRate,
          pairPricePerStudent: pricing.pairPricePerStudent,
          groupPricePerStudent: pricing.groupPricePerStudent,
        }}
        teachersWithOwnRate={teachersWithOwnRate ?? 0}
      />
    </div>
  )
}
