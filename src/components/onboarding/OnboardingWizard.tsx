'use client'

import { useState } from 'react'
import { StepIndicator, type StepDef } from './StepIndicator'
import { WelcomeStep } from './steps/WelcomeStep'
import { TeachersStep } from './steps/TeachersStep'
import { ImportStudentsStep } from './steps/ImportStudentsStep'
import { ImportLessonsStep } from './steps/ImportLessonsStep'
import { SettingsStep } from './steps/SettingsStep'
import { CompleteStep } from './steps/CompleteStep'

export type OnboardingStep =
  | 'welcome'
  | 'teachers'
  | 'import-students'
  | 'import-lessons'
  | 'settings'
  | 'complete'

const STEPS: StepDef[] = [
  { id: 'welcome', label: 'ברוכים הבאים' },
  { id: 'teachers', label: 'מורים' },
  { id: 'import-students', label: 'תלמידים והורים' },
  { id: 'import-lessons', label: 'שיעורים' },
  { id: 'settings', label: 'הגדרות' },
  { id: 'complete', label: 'סיום' },
]

interface OnboardingWizardProps {
  orgId: string
  orgName: string
  ownerName: string
  timezone: string
  billingMode: string
  teachers: { id: string; full_name: string }[]
  counts: {
    students: number
    parents: number
    lessons: number
    teachers: number
  }
}

export function OnboardingWizard({
  orgId,
  orgName,
  ownerName,
  timezone,
  billingMode,
  teachers: initialTeachers,
  counts: initialCounts,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [counts, setCounts] = useState(initialCounts)

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
    <div>
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
          orgId={orgId}
          onNext={goNext}
          onBack={goBack}
          onCountChange={(n) => updateCounts({ teachers: n })}
        />
      )}

      {step === 'import-students' && (
        <ImportStudentsStep
          orgId={orgId}
          onNext={goNext}
          onBack={goBack}
          onCountsChange={(s, p) => updateCounts({ students: s, parents: p })}
        />
      )}

      {step === 'import-lessons' && (
        <ImportLessonsStep
          orgId={orgId}
          onNext={goNext}
          onBack={goBack}
          onCountChange={(n) => updateCounts({ lessons: n })}
        />
      )}

      {step === 'settings' && (
        <SettingsStep
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step === 'complete' && (
        <CompleteStep counts={counts} />
      )}
    </div>
  )
}
