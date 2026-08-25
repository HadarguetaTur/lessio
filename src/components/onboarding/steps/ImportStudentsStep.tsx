'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ArrowRight, GraduationCap, Users, UsersRound } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'
import {
  onboardingAccentTabActive,
  onboardingGradientCta,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

interface ImportStudentsStepProps {
  initialStudents: number
  initialParents: number
  onNext: () => void
  onBack: () => void
  onCountsChange: (students: number, parents: number) => void
}

type Tab = 'family-list' | 'students' | 'parents'

/** Snap cumulative counts toward server totals plus import batches (refs avoid clobbering the other tab). */
export function ImportStudentsStep({
  initialStudents,
  initialParents,
  onNext,
  onBack,
  onCountsChange,
}: ImportStudentsStepProps) {
  const t = useTranslations('onboarding.importStudents')
  const tNav = useTranslations('onboarding.nav')
  const [tab, setTab] = useState<Tab>('family-list')
  const [familyListDone, setFamilyListDone] = useState(false)
  const [studentsDone, setStudentsDone] = useState(false)
  const [parentsDone, setParentsDone] = useState(false)

  const studentRef = useRef(initialStudents)
  const parentRef = useRef(initialParents)

  const hasImportActivity = familyListDone || studentsDone || parentsDone

  const pushStudents = (inserted: number) => {
    studentRef.current += inserted
    onCountsChange(studentRef.current, parentRef.current)
  }
  const pushParents = (inserted: number) => {
    parentRef.current += inserted
    onCountsChange(studentRef.current, parentRef.current)
  }

  const tabClass = (active: boolean) =>
    `-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
      active
        ? onboardingAccentTabActive
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="text-center mb-8">
        <h2 className={onboardingStepTitle}>{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        <p className="text-muted-foreground mt-1 text-sm">{t('hint')}</p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border/70">
        <button type="button" onClick={() => setTab('family-list')} className={tabClass(tab === 'family-list')}>
          <UsersRound size={15} />
          {t('familyListTab')}
          {familyListDone && <span className="text-emerald-700 text-xs me-1">✓</span>}
        </button>
        <button type="button" onClick={() => setTab('students')} className={tabClass(tab === 'students')}>
          <GraduationCap size={15} />
          {t('studentsTab')}
          {studentsDone && <span className="text-emerald-700 text-xs me-1">✓</span>}
        </button>
        <button type="button" onClick={() => setTab('parents')} className={tabClass(tab === 'parents')}>
          <Users size={15} />
          {t('parentsTab')}
          {parentsDone && <span className="text-emerald-700 text-xs me-1">✓</span>}
        </button>
      </div>

      {tab === 'family-list' && (
        <ImportFlow
          entityType="family-list"
          onComplete={(count) => {
            setFamilyListDone(true)
            pushStudents(count)
          }}
        />
      )}
      {tab === 'students' && (
        <ImportFlow
          entityType="students"
          onComplete={(count) => {
            setStudentsDone(true)
            pushStudents(count)
          }}
        />
      )}
      {tab === 'parents' && (
        <ImportFlow
          entityType="parents"
          onComplete={(count) => {
            setParentsDone(true)
            pushParents(count)
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
