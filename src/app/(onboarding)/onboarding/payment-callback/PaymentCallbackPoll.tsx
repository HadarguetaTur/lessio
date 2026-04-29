'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { checkSaasActivationAndComplete } from '@/app/(onboarding)/onboarding/saas-actions'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

const POLL_MS = 2500
const MAX_TICKS = 24 // ~60s

export function PaymentCallbackPoll() {
  const t = useTranslations('onboarding.paymentCallback')
  const router = useRouter()
  const [ticks, setTicks] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const stopped = useRef(false)

  useEffect(() => {
    if (timedOut) return

    const id = window.setInterval(async () => {
      if (stopped.current) return
      const r = await checkSaasActivationAndComplete()
      if (r === 'dashboard') {
        stopped.current = true
        router.replace('/dashboard')
        return
      }
      setTicks((x) => {
        const next = x + 1
        if (next >= MAX_TICKS) {
          stopped.current = true
          setTimedOut(true)
        }
        return next
      })
    }, POLL_MS)

    return () => window.clearInterval(id)
  }, [router, timedOut])

  if (timedOut) {
    return (
      <div className={`mx-auto max-w-md space-y-4 text-center ${onboardingPanelCard} ${onboardingPanelPadding} py-10`}>
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t('timeoutTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('timeoutBody')}</p>
        <Link
          href="/onboarding"
          className="inline-flex text-sm font-semibold text-violet-600 underline-offset-4 hover:underline dark:text-violet-400"
        >
          {t('backToOnboarding')}
        </Link>
      </div>
    )
  }

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
