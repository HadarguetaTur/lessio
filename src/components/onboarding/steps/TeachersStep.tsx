'use client'

import { useState, useActionState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, User, Users, Plus, Check, ArrowRight, FileUp } from 'lucide-react'
import { addTeacher, createOwnerTeacher } from '@/app/(onboarding)/onboarding/actions'
import { ImportFlow } from '@/components/import/ImportFlow'
import {
  onboardingChoiceCard,
  onboardingGradientCta,
  onboardingPanelCard,
  onboardingPanelPadding,
  onboardingStepTitle,
} from '@/components/onboarding/onboardingVisual'

type Mode = 'choose' | 'manual' | 'import'

interface TeachersStepProps {
  teachers: { id: string; full_name: string }[]
  onNext: () => void
  onBack: () => void
  onCountChange: (count: number) => void
}

export function TeachersStep({
  teachers: initialTeachers,
  onNext,
  onBack,
  onCountChange,
}: TeachersStepProps) {
  const t = useTranslations('onboarding.teachers')
  const tNav = useTranslations('onboarding.nav')
  const [mode, setMode] = useState<Mode>('choose')
  const [soloError, setSoloError] = useState<string | null>(null)
  const [addedTeachers, setAddedTeachers] = useState<string[]>(
    initialTeachers.map((row) => row.full_name)
  )
  const importExtraRef = useRef(0)

  const [addState, addAction, addPending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await addTeacher(_prev, formData)
      if (!result) {
        const name = (formData.get('full_name') as string)?.trim()
        if (name) {
          setAddedTeachers((prev) => {
            const next = [...prev, name]
            onCountChange(next.length + importExtraRef.current)
            return next
          })
        }
      }
      return result
    },
    null
  )

  const handleSoloTeacher = async () => {
    setSoloError(null)
    const result = await createOwnerTeacher()
    if (result?.error) {
      setSoloError(result.error)
      return
    }
    onCountChange(1)
    onNext()
  }

  if (mode === 'choose') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h2 className={onboardingStepTitle}>{t('title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSoloTeacher}
            className={onboardingChoiceCard}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 ring-1 ring-teal-400/25">
              <User size={20} className="text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <div className="font-medium text-foreground">{t('soloTeacher')}</div>
              <div className="text-sm text-muted-foreground">{t('soloTeacherDesc')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('manual')}
            className={onboardingChoiceCard}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/25">
              <Users size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="font-medium text-foreground">{t('addTeachers')}</div>
              <div className="text-sm text-muted-foreground">{t('addTeachersDesc')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('import')}
            className={onboardingChoiceCard}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/25">
              <FileUp size={20} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="font-medium text-foreground">{t('importFromFile')}</div>
              <div className="text-sm text-muted-foreground">{t('importFromFileDesc')}</div>
            </div>
          </button>
        </div>

        {soloError && (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{soloError}</span>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={onBack}>
            <ArrowRight size={14} className="ms-1.5" />
            {tNav('back')}
          </Button>
          <Button variant="ghost" onClick={onNext}>
            {tNav('skip')}
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'import') {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h2 className={onboardingStepTitle}>{t('importTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('importSubtitle')}</p>
        </div>

        <ImportFlow
          entityType="teachers"
          onComplete={(count) => {
            importExtraRef.current += count
            onCountChange(addedTeachers.length + importExtraRef.current)
          }}
        />

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => setMode('choose')}>
            <ArrowRight size={14} className="ms-1.5" />
            {tNav('back')}
          </Button>
          <Button className={`h-11 px-6 font-semibold ${onboardingGradientCta}`} onClick={onNext}>
            {tNav('next')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <h2 className={onboardingStepTitle}>{t('title')}</h2>
        <p className="mt-2 text-muted-foreground">{t('manualSubtitle')}</p>
      </div>

      {addedTeachers.length > 0 && (
        <div className="mb-6 space-y-2">
          {addedTeachers.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/50 p-3 ring-1 ring-foreground/[0.03]"
            >
              <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
                <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium">{name}</span>
            </div>
          ))}
        </div>
      )}

      <form
        action={addAction}
        className={`${onboardingPanelCard} ${onboardingPanelPadding} space-y-4`}
      >
        {addState?.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{addState.error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="teacher_name">{t('fullName')}</Label>
            <Input
              id="teacher_name"
              name="full_name"
              type="text"
              required
              placeholder={t('namePlaceholder')}
              className="h-11 bg-background/50 px-3.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher_email">{t('emailLabel')}</Label>
            <Input
              id="teacher_email"
              name="email"
              type="email"
              required
              placeholder="teacher@example.com"
              dir="ltr"
              className="h-11 bg-background/50 px-3.5"
            />
          </div>
        </div>

        <Button type="submit" variant="outline" disabled={addPending} className="w-full">
          <Plus size={14} className="ms-1.5" />
          {addPending ? t('adding') : t('addTeacher')}
        </Button>
      </form>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={() => setMode('choose')}>
          <ArrowRight size={14} className="ms-1.5" />
          {tNav('back')}
        </Button>
        <Button className={`h-11 px-6 font-semibold ${onboardingGradientCta}`} onClick={onNext}>
          {tNav('next')}
        </Button>
      </div>
    </div>
  )
}
