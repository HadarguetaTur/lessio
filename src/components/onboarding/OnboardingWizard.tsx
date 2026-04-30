'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { StepIndicator, type StepDef } from './StepIndicator'
import { WelcomeStep } from './steps/WelcomeStep'
import { TeachersStep } from './steps/TeachersStep'
import { ImportStudentsStep } from './steps/ImportStudentsStep'
import { ImportLessonsStep } from './steps/ImportLessonsStep'
import { SettingsStep } from './steps/SettingsStep'
import { PlanSelectionStep } from './steps/PlanSelectionStep'
import { CompleteStep } from './steps/CompleteStep'
import type { SaasPlanRow } from '@/lib/saas/plans'

export type OnboardingStep =
  | 'welcome'
  | 'teachers'
  | 'import-students'
  | 'import-lessons'
  | 'settings'
  | 'plan-selection'
  | 'complete'

interface OnboardingWizardProps {
  orgName: string
  ownerName: string
  timezone: string
  billingMode: string
  settingsDefaults: {
    noticeHoursFull: number
    partialChargePercent: number
    lessonReminderHours: number
    paymentReminderDays: number
  }
  teachers: { id: string; full_name: string }[]
  saasPlans: SaasPlanRow[]
  counts: {
    students: number
    parents: number
    lessons: number
    teachers: number
  }
}

export function OnboardingWizard({
  orgName,
  ownerName,
  timezone,
  billingMode,
  settingsDefaults,
  teachers: initialTeachers,
  saasPlans,
  counts: initialCounts,
}: OnboardingWizardProps) {
  const t = useTranslations('onboarding.steps')
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [counts, setCounts] = useState(initialCounts)

  const STEPS: StepDef[] = useMemo(
    () => [
      { id: 'welcome', label: t('welcome') },
      { id: 'teachers', label: t('teachers') },
      { id: 'import-students', label: t('importStudents') },
      { id: 'import-lessons', label: t('importLessons') },
      { id: 'settings', label: t('settings') },
      { id: 'plan-selection', label: t('planSelection') },
      { id: 'complete', label: t('complete') },
    ],
    [t]
  )

  const goNext = () => {
    const idx = STEPS.findIndex((s) => s.id === step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id as OnboardingStep)
    }
  }

  const goBack = () => {
    const idx = STEPS.findIndex((s) => s.id === step)
    if (idx > 0) {
      setStep(STEPS[idx - 1].id as OnboardingStep)
    }
  }

  const updateCounts = (partial: Partial<typeof counts>) => {
    setCounts((prev) => ({ ...prev, ...partial }))
  }

  return (
    <div className="w-full min-w-0">
      <StepIndicator steps={STEPS} currentStepId={step} />

      {step === 'welcome' && (
        <WelcomeStep
          orgName={orgName}
          ownerName={ownerName}
          timezone={timezone}
          billingMode={billingMode}
          onNext={goNext}
        />
      )}

      {step === 'teachers' && (
        <TeachersStep
          teachers={initialTeachers}
          onNext={goNext}
          onBack={goBack}
          onCountChange={(n) => updateCounts({ teachers: n })}
        />
      )}

      {step === 'import-students' && (
        <ImportStudentsStep
          initialStudents={counts.students}
          initialParents={counts.parents}
          onNext={goNext}
          onBack={goBack}
          onCountsChange={(s, p) => updateCounts({ students: s, parents: p })}
        />
      )}

      {step === 'import-lessons' && (
        <ImportLessonsStep
          initialLessons={counts.lessons}
          onNext={goNext}
          onBack={goBack}
          onCountChange={(n) => updateCounts({ lessons: n })}
        />
      )}

      {step === 'settings' && (
        <SettingsStep settingsDefaults={settingsDefaults} onNext={goNext} onBack={goBack} />
      )}

      {step === 'plan-selection' && (
        <PlanSelectionStep
          plans={saasPlans}
          onBack={goBack}
          onFreeContinue={goNext}
          onContinueWithoutPayment={goNext}
        />
      )}

      {step === 'complete' && <CompleteStep counts={counts} onBack={goBack} />}
    </div>
  )
}
