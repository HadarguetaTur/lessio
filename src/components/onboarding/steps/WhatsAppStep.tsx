'use client'

/**
 * The product's core feature, introduced during setup instead of discovered
 * later. Two of its three prerequisites take days to obtain, so the point of
 * this step is that she learns that now rather than a month in.
 *
 * It cannot link straight to /settings/whatsapp: the dashboard layout bounces
 * an owner whose onboarding is unfinished back to /onboarding. So the choice is
 * recorded here and the wizard's final button lands there instead of on the
 * dashboard. Skipping is always available and never blocks completion.
 */

import { useTranslations } from 'next-intl'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WhatsAppRequirements } from '@/components/dashboard/settings/WhatsAppRequirements'
import {
  onboardingGradientCta,
  onboardingHeroIconClass,
  onboardingHeroIconShell,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

interface WhatsAppStepProps {
  onConnect: () => void
  onSkip: () => void
  onBack: () => void
}

export function WhatsAppStep({ onConnect, onSkip, onBack }: WhatsAppStepProps) {
  const t = useTranslations('onboarding.whatsapp')
  const tNav = useTranslations('onboarding.nav')

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="text-center">
        <div className={onboardingHeroIconShell}>
          <MessageCircle className={onboardingHeroIconClass} aria-hidden />
        </div>
        <h2 className={`${onboardingStepTitle} mb-2`}>{t('title')}</h2>
        <p className="text-muted-foreground mb-6">{t('description')}</p>
      </div>

      <WhatsAppRequirements />

      {/* Equal weight on purpose: skipping is a legitimate answer, and burying
          it would only produce abandoned half-connections. */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          type="button"
          onClick={onConnect}
          className={`h-11 flex-1 font-semibold ${onboardingGradientCta}`}
        >
          {t('cta')}
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onSkip}>
          {t('skip')}
        </Button>
      </div>

      <div className="mt-6 flex justify-start">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowRight size={14} className="ms-1.5 rtl:rotate-180" />
          {tNav('back')}
        </Button>
      </div>
    </div>
  )
}
