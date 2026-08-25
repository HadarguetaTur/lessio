'use client'

import { useState, useRef } from 'react'
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
  initialLessons: number
  onNext: () => void
  onBack: () => void
  onCountChange: (count: number) => void
}

type Tab = 'schedule' | 'history'

export function ImportLessonsStep({
  initialLessons,
  onNext,
  onBack,
  onCountChange,
}: ImportLessonsStepProps) {
  const t = useTranslations('onboarding.importLessons')
  const tNav = useTranslations('onboarding.nav')
  const [tab, setTab] = useState<Tab>('schedule')
  const [scheduleDone, setScheduleDone] = useState(false)
  const [historyDone, setHistoryDone] = useState(false)

  const lessonRef = useRef(initialLessons)

  const hasImportActivity = scheduleDone || historyDone

  const pushLessons = (inserted: number) => {
    lessonRef.current += inserted
    onCountChange(lessonRef.current)
  }

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
          {scheduleDone && <span className="text-emerald-700 text-xs me-1">✓</span>}
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
          {historyDone && <span className="text-emerald-700 text-xs me-1">✓</span>}
        </button>
      </div>

      {tab === 'schedule' && (
        <ImportFlow
          entityType="lessons-schedule"
          onComplete={(count) => {
            setScheduleDone(true)
            pushLessons(count)
          }}
        />
      )}
      {tab === 'history' && (
        <ImportFlow
          entityType="lessons-history"
          onComplete={(count) => {
            setHistoryDone(true)
            pushLessons(count)
          }}
        />
      )}

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={14} className="ms-1.5" />
          {tNav('back')}
        </Button>
        <Button className={`h-11 px-6 font-semibold ${onboardingGradientCta}`} onClick={onNext}>
          {hasImportActivity ? tNav('next') : tNav('skip')}
        </Button>
      </div>
    </div>
  )
}
