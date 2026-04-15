import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  getOrgSubscriptionState,
  isOrgSaasReadOnly,
  isTrialExpired,
} from '@/lib/saas/subscriptions'

export async function SaasOwnerBanners({ orgId }: { orgId: string }) {
  const t = await getTranslations('saas')
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return null

  if (isOrgSaasReadOnly(state)) {
    return (
      <div
        role="status"
        className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      >
        {t('readOnlyBanner')}
        <Link href="/account/billing" className="ms-2 font-medium underline underline-offset-4">
          {t('manageBilling')}
        </Link>
      </div>
    )
  }

  if (state.status === 'trial' && state.trialEndsAt && !isTrialExpired(state)) {
    const days = Math.max(
      0,
      Math.ceil((new Date(state.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    )
    return (
      <div
        role="status"
        className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100"
      >
        {t('trialBanner', { days })}
        <Link href="/account/billing" className="ms-2 font-medium underline underline-offset-4">
          {t('manageBilling')}
        </Link>
      </div>
    )
  }

  return null
}
