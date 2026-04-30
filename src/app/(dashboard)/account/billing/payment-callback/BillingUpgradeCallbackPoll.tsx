'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { checkUpgradeActivationAction } from '@/app/(dashboard)/account/billing/upgrade-actions'

export function BillingUpgradeCallbackPoll() {
  const t = useTranslations('saas.accountBilling.paymentCallback')
  const router = useRouter()
  const [ticks, setTicks] = useState(0)
  const stopped = useRef(false)

  useEffect(() => {
    const id = window.setInterval(async () => {
      if (stopped.current) return
      const r = await checkUpgradeActivationAction()
      if (r === 'billing') {
        stopped.current = true
        router.replace('/account/billing')
        return
      }
      setTicks((x) => x + 1)
    }, 2500)

    return () => window.clearInterval(id)
  }, [router])

  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="mb-2 text-muted-foreground">{t('processing')}</p>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {ticks > 8 ? (
        <p className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-400">{t('slow')}</p>
      ) : null}
    </div>
  )
}
