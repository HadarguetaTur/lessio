import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import BusinessProfileForm from './BusinessProfileForm'

export default async function BusinessProfilePage() {
  const session = await getSession()
  if (session.role !== 'owner') redirect('/settings')

  const t = await getTranslations('settings.businessProfile')

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select(
      'business_legal_name, tax_id, business_address, currency, default_vat_rate, logo_url, enforce_weekly_quota'
    )
    .eq('id', session.orgId)
    .single()

  const initialData = {
    businessLegalName: (org as Record<string, unknown>)?.business_legal_name as string | null ?? null,
    taxId: (org as Record<string, unknown>)?.tax_id as string | null ?? null,
    businessAddress: (org as Record<string, unknown>)?.business_address as string | null ?? null,
    currency: ((org as Record<string, unknown>)?.currency as string) ?? 'ILS',
    defaultVatRate: Number((org as Record<string, unknown>)?.default_vat_rate ?? 0),
    logoUrl: (org as Record<string, unknown>)?.logo_url as string | null ?? null,
    enforceWeeklyQuota: ((org as Record<string, unknown>)?.enforce_weekly_quota as boolean | null) ?? true,
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <BusinessProfileForm initialData={initialData} />
    </div>
  )
}
