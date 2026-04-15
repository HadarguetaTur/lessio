'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Sparkles } from 'lucide-react'
import { updateOrgSettings } from '@/app/(onboarding)/onboarding/actions'
import {
  onboardingGradientCta,
  onboardingHeroIconClass,
  onboardingHeroIconShell,
  onboardingPanelCard,
  onboardingPanelPadding,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

const TIMEZONE_VALUES = [
  'Asia/Jerusalem',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Berlin',
] as const

interface WelcomeStepProps {
  orgName: string
  ownerName: string
  timezone: string
  billingMode: string
  onNext: () => void
}

export function WelcomeStep({
  orgName,
  ownerName,
  timezone,
  billingMode,
  onNext,
}: WelcomeStepProps) {
  const tWelcome = useTranslations('onboarding.welcome')
  const tNav = useTranslations('onboarding.nav')

  const [state, action, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await updateOrgSettings(_prev, formData)
      if (!result) onNext()
      return result
    },
    null
  )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <div className={onboardingHeroIconShell}>
          <Sparkles className={onboardingHeroIconClass} aria-hidden />
        </div>
        <h2 className={onboardingStepTitle}>
          {tWelcome('title', { name: ownerName })}
        </h2>
        <p className="text-muted-foreground mt-2">
          {tWelcome('subtitle', { orgName })}
        </p>
      </div>

      <form
        action={action}
        className={`${onboardingPanelCard} ${onboardingPanelPadding} space-y-5`}
      >
        {state?.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="timezone">{tWelcome('timezone')}</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            className="h-11 w-full rounded-lg border border-input bg-background/50 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {TIMEZONE_VALUES.map((tz) => (
              <option key={tz} value={tz}>
                {tWelcome(`timezones.${tz}` as never)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>{tWelcome('billingMode')}</Label>
          <div className="grid grid-cols-2 gap-3">
            <label className="relative flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/40 has-[:checked]:border-violet-400/50 has-[:checked]:bg-violet-500/[0.06] has-[:checked]:ring-1 has-[:checked]:ring-violet-500/20">
              <Input
                type="radio"
                name="billing_mode"
                value="monthly"
                defaultChecked={billingMode === 'monthly'}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">{tWelcome('monthly')}</div>
                <div className="text-xs text-muted-foreground">{tWelcome('monthlyDesc')}</div>
              </div>
            </label>
            <label className="relative flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/40 has-[:checked]:border-violet-400/50 has-[:checked]:bg-violet-500/[0.06] has-[:checked]:ring-1 has-[:checked]:ring-violet-500/20">
              <Input
                type="radio"
                name="billing_mode"
                value="per_lesson"
                defaultChecked={billingMode === 'per_lesson'}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">{tWelcome('perLesson')}</div>
                <div className="text-xs text-muted-foreground">{tWelcome('perLessonDesc')}</div>
              </div>
            </label>
          </div>
        </div>

        <Button
          type="submit"
          disabled={pending}
          className={`h-11 w-full px-4 text-base font-semibold ${onboardingGradientCta}`}
        >
          {pending ? tNav('saving') : tNav('next')}
        </Button>
      </form>
    </div>
  )
}
