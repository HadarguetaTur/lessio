import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getCancellationPolicyOrDefaults } from '@/lib/cancellation-policy'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'
import { listPackProducts } from '@/lib/billing/packs/products'
import { CancellationPolicyForm } from '@/components/dashboard/settings/CancellationPolicyForm'
import { PackCatalogManager } from '@/components/dashboard/settings/PackCatalogManager'
import { updateCancellationPolicy, savePackProductAction, setPackProductActiveAction } from './actions'

/** Cancellations, no-shows and punch cards: one policy, one page (decision #46). */
export default async function CancellationPolicyPage() {
  const tp = await getTranslations('settings')
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.cancellationPolicy')
  const [{ policy, values, collection }, billing, products] = await Promise.all([
    getCancellationPolicyOrDefaults(orgId),
    getOrgBillingPolicy(orgId),
    listPackProducts(orgId),
  ])
  const isOwner = role === 'owner'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{tp('cancellationPolicyPage.subtitle')}</p>

        {!policy && (
          <div className="mb-5 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
            {tp('cancellationPolicyPage.noPolicy')}
          </div>
        )}

        {!isOwner && (
          <div className="mb-5 text-sm text-gray-600 bg-gray-50 border border-gray-200 p-3 rounded-md">
            {tp('cancellationPolicyPage.readOnly')}
          </div>
        )}

        <CancellationPolicyForm
          action={updateCancellationPolicy}
          defaultValues={values}
          collection={collection}
          billingMode={billing.billingMode}
          readOnly={!isOwner}
        />
      </div>

      <PackCatalogManager
        products={products}
        readOnly={!isOwner}
        saveAction={savePackProductAction}
        setActiveAction={setPackProductActiveAction}
      />
    </div>
  )
}
