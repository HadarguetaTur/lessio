'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AlertCircle, ArrowRight, Settings } from 'lucide-react'
import { updateBasicSettings } from '@/app/(onboarding)/onboarding/actions'
import {
  onboardingGradientCta,
  onboardingHeroIconClass,
  onboardingHeroIconShell,
  onboardingPanelCard,
  onboardingPanelPadding,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

const NOTICE_HOURS = [2, 4, 12, 24, 48] as const
const CHARGE_PERCENTS = [0, 25, 50, 75, 100] as const
// Must match the CHECK on organizations.automation_lesson_reminder_hours
// (migration 20260514000001) and the Zod refine in the WhatsApp automations
// action. 4 and 48 were offered here for a column the reminder cron never read.
const REMINDER_HOURS = [2, 12, 24] as const
const PAYMENT_DAYS = [3, 5, 7, 14, 30] as const

function snapToAllowed(
  value: number,
  allowed: readonly number[],
  fallback: number
): string {
  if (allowed.includes(value)) return String(value)
  return String(fallback)
}

interface SettingsStepProps {
  settingsDefaults: {
    noticeHoursFull: number
    partialChargePercent: number
    lessonReminderHours: number
    paymentReminderDays: number
  }
  onNext: () => void
  onBack: () => void
}

export function SettingsStep({ settingsDefaults, onNext, onBack }: SettingsStepProps) {
  const t = useTranslations('onboarding.settings')
  const tNav = useTranslations('onboarding.nav')

  const [state, action, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await updateBasicSettings(_prev, formData)
      if (!result) onNext()
      return result
    },
    null
  )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <div className={onboardingHeroIconShell}>
          <Settings className={onboardingHeroIconClass} aria-hidden />
        </div>
        <h2 className={onboardingStepTitle}>{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      <form
        action={action}
        className={`${onboardingPanelCard} ${onboardingPanelPadding} space-y-6`}
      >
        {state?.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('cancellation')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notice_hours">{t('noticeHours')}</Label>
              <select
                id="notice_hours"
                name="notice_hours"
                defaultValue={snapToAllowed(
                  settingsDefaults.noticeHoursFull,
                  NOTICE_HOURS,
                  24
                )}
                className="h-11 w-full rounded-lg border border-input bg-background/50 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {NOTICE_HOURS.map((h) => (
                  <option key={h} value={String(h)}>
                    {t('unitHours', { count: h })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge_percent">{t('chargePercent')}</Label>
              <select
                id="charge_percent"
                name="charge_percent"
                defaultValue={snapToAllowed(
                  settingsDefaults.partialChargePercent,
                  CHARGE_PERCENTS,
                  50
                )}
                className="h-11 w-full rounded-lg border border-input bg-background/50 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {CHARGE_PERCENTS.map((p) => (
                  <option key={p} value={String(p)}>
                    {t('unitPercent', { n: p })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('reminders')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="automation_lesson_reminder_hours">{t('lessonReminder')}</Label>
              <select
                id="automation_lesson_reminder_hours"
                name="automation_lesson_reminder_hours"
                defaultValue={snapToAllowed(
                  settingsDefaults.lessonReminderHours,
                  REMINDER_HOURS,
                  24
                )}
                className="h-11 w-full rounded-lg border border-input bg-background/50 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {REMINDER_HOURS.map((h) => (
                  <option key={h} value={String(h)}>
                    {t('unitHours', { count: h })}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment_reminder_days">{t('paymentReminder')}</Label>
              <select
                id="payment_reminder_days"
                name="payment_reminder_days"
                defaultValue={snapToAllowed(
                  settingsDefaults.paymentReminderDays,
                  PAYMENT_DAYS,
                  7
                )}
                className="h-11 w-full rounded-lg border border-input bg-background/50 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {PAYMENT_DAYS.map((d) => (
                  <option key={d} value={String(d)}>
                    {t('unitDays', { count: d })}
                  </option>
                ))}
              </select>
            </div>
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

      <div className="flex justify-start mt-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={14} className="ms-1.5" />
          {tNav('back')}
        </Button>
      </div>
    </div>
  )
}
