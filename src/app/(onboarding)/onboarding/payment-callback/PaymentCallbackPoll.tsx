'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { checkSaasActivationAndComplete } from '@/app/(onboarding)/onboarding/saas-actions'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

export function PaymentCallbackPoll() {
  const t = useTranslations('onboarding.paymentCallback')
  const router = useRouter()
  const [ticks, setTicks] = useState(0)
  const stopped = useRef(false)

  useEffect(() => {
    const id = window.setInterval(async () => {
      if (stopped.current) return
      const r = await checkSaasActivationAndComplete()
      if (r === 'dashboard') {
        stopped.current = true
        router.replace('/dashboard')
        return
      }
      setTicks((x) => x + 1)
    }, 2500)

    return () => window.clearInterval(id)
  }, [router])

  return (
    <div className={`mx-auto max-w-md text-center ${onboardingPanelCard} ${onboardingPanelPadding} py-10`}>
      <p className="mb-2 text-muted-foreground">{t('processing')}</p>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      {ticks > 8 ? (
        <p className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-400">{t('slow')}</p>
      ) : null}
    </div>
  )
}
