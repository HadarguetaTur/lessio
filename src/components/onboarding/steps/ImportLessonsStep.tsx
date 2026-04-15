'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ArrowRight, CalendarDays, History } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'
import {
  onboardingAccentTabActive,
  onboardingGradientCta,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

interface ImportLessonsStepProps {
  orgId: string
  onNext: () => void
  onBack: () => void
  onCountChange: (count: number) => void
}

type Tab = 'schedule' | 'history'

export function ImportLessonsStep({
  orgId,
  onNext,
  onBack,
  onCountChange,
}: ImportLessonsStepProps) {
  const t = useTranslations('onboarding.importLessons')
  const tNav = useTranslations('onboarding.nav')
  const [tab, setTab] = useState<Tab>('schedule')
  const [scheduleDone, setScheduleDone] = useState(false)
  const [historyDone, setHistoryDone] = useState(false)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8 text-center">
        <h2 className={onboardingStepTitle}>{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border/70">
        <button
          type="button"
          onClick={() => setTab('schedule')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'schedule'
              ? onboardingAccentTabActive
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays size={15} />
          {t('schedule')}
          {scheduleDone && <span className="text-emerald-600 text-xs me-1">✓</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'history'
              ? onboardingAccentTabActive
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History size={15} />
          {t('history')}
          {historyDone && <span className="text-emerald-600 text-xs me-1">✓</span>}
        </button>
      </div>

      {tab === 'schedule' && (
        <ImportFlow
          entityType="lessons-schedule"
          orgId={orgId}
          onComplete={(count) => {
            setScheduleDone(true)
            onCountChange(count)
          }}
        />
      )}
      {tab === 'history' && (
        <ImportFlow
          entityType="lessons-history"
          orgId={orgId}
          onComplete={(count) => {
            setHistoryDone(true)
            onCountChange(count)
          }}
        />
      )}

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={14} className="ms-1.5" />
          {tNav('back')}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext}>
            {tNav('skip')}
          </Button>
          <Button className={`h-11 px-6 font-semibold ${onboardingGradientCta}`} onClick={onNext}>
            {tNav('next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
