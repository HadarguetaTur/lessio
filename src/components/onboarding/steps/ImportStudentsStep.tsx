'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ArrowRight, GraduationCap, Users } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'
import {
  onboardingAccentTabActive,
  onboardingGradientCta,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

interface ImportStudentsStepProps {
  orgId: string
  onNext: () => void
  onBack: () => void
  onCountsChange: (students: number, parents: number) => void
}

type Tab = 'students' | 'parents'

export function ImportStudentsStep({
  orgId,
  onNext,
  onBack,
  onCountsChange,
}: ImportStudentsStepProps) {
  const t = useTranslations('onboarding.importStudents')
  const tNav = useTranslations('onboarding.nav')
  const [tab, setTab] = useState<Tab>('students')
  const [studentsDone, setStudentsDone] = useState(false)
  const [parentsDone, setParentsDone] = useState(false)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="text-center mb-8">
        <h2 className={onboardingStepTitle}>{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        <p className="text-muted-foreground mt-1 text-sm">{t('hint')}</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border/70">
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'students'
              ? onboardingAccentTabActive
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GraduationCap size={15} />
          {t('studentsTab')}
          {studentsDone && <span className="text-emerald-600 text-xs me-1">✓</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('parents')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'parents'
              ? onboardingAccentTabActive
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users size={15} />
          {t('parentsTab')}
          {parentsDone && <span className="text-emerald-600 text-xs me-1">✓</span>}
        </button>
      </div>

      {tab === 'students' && (
        <ImportFlow
          entityType="students"
          orgId={orgId}
          onComplete={(count) => {
            setStudentsDone(true)
            onCountsChange(count, 0)
          }}
        />
      )}
      {tab === 'parents' && (
        <ImportFlow
          entityType="parents"
          orgId={orgId}
          onComplete={(count) => {
            setParentsDone(true)
            onCountsChange(0, count)
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
