'use client'

import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle2, GraduationCap, Users, BookOpen, UserCheck } from 'lucide-react'
import { completeOnboarding } from '@/app/(onboarding)/onboarding/actions'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  onboardingGradientCta,
  onboardingPanelCard,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

interface CompleteStepProps {
  counts: {
    students: number
    parents: number
    lessons: number
    teachers: number
  }
  onBack: () => void
}

export function CompleteStep({ counts, onBack }: CompleteStepProps) {
  const t = useTranslations('onboarding.complete')
  const tNav = useTranslations('onboarding.nav')
  const [pending, startTransition] = useTransition()

  // useTransition is required so Next.js can pick up the server action's
  // redirect() and navigate the client. Plain `await` on the action leaves
  // the page stuck on the loading state until the user refreshes.
  const handleComplete = () => {
    startTransition(async () => {
      await completeOnboarding()
    })
  }

  const stats = [
    {
      label: t('stats.teachers'),
      value: counts.teachers,
      icon: UserCheck,
      color: 'text-teal-700 bg-teal-500/15 ring-1 ring-teal-400/25 dark:text-teal-300',
    },
    {
      label: t('stats.students'),
      value: counts.students,
      icon: GraduationCap,
      color: 'text-emerald-700 bg-emerald-500/15 ring-1 ring-emerald-400/25 dark:text-emerald-300',
    },
    {
      label: t('stats.parents'),
      value: counts.parents,
      icon: Users,
      color: 'text-violet-700 bg-violet-500/15 ring-1 ring-violet-400/25 dark:text-violet-300',
    },
    {
      label: t('stats.lessons'),
      value: counts.lessons,
      icon: BookOpen,
      color: 'text-amber-700 bg-amber-500/15 ring-1 ring-amber-400/30 dark:text-amber-300',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-600/25 shadow-md ring-4 ring-emerald-400/20">
        <CheckCircle2 size={40} className="text-emerald-700 dark:text-emerald-400" aria-hidden />
      </div>

      <h2 className={`${onboardingStepTitle} mb-2`}>{t('title')}</h2>
      <p className="text-muted-foreground mb-8">{t('subtitle')}</p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${onboardingPanelCard} flex items-center gap-3 p-4`}
          >
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${stat.color}`}>
              <stat.icon size={20} />
            </div>
            <div className="text-start">
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Button variant="outline" type="button" className="h-11 w-full" onClick={onBack}>
          <ArrowRight size={14} className="ms-1.5 rtl:rotate-180" />
          {tNav('back')}
        </Button>
        <Button
          type="button"
          onClick={handleComplete}
          disabled={pending}
          className={`h-12 w-full text-base font-semibold ${onboardingGradientCta}`}
        >
          {pending ? t('loading') : t('goToDashboard')}
        </Button>
      </div>
    </div>
  )
}
