import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getCancellationPolicyOrDefaults } from '@/lib/cancellation-policy'
import { CancellationPolicyForm } from '@/components/dashboard/settings/CancellationPolicyForm'
import { updateCancellationPolicy } from './actions'

export default async function CancellationPolicyPage() {
  const tp = await getTranslations('settings')
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.cancellationPolicy')
  const { policy, values } = await getCancellationPolicyOrDefaults(orgId)
  const isOwner = role === 'owner'

  return (
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
        readOnly={!isOwner}
      />
    </div>
  )
}
