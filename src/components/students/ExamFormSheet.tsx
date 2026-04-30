'use client'

import { useState, useTransition, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { StudentExam } from '@/lib/students/exams'
import type { ExamActionState } from '@/app/(dashboard)/students/[id]/actions'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

type Props = {
  studentId: string
  exam: StudentExam | null
  open: boolean
  onOpenChange: (open: boolean) => void
  createAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  updateAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  canEdit: boolean
  onSuccess: () => void
}

export function ExamFormSheet({
  studentId,
  exam,
  open,
  onOpenChange,
  createAction,
  updateAction,
  canEdit,
  onSuccess,
}: Props) {
  const t = useTranslations('studentProfile.exams.form')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const isEdit = Boolean(exam)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canEdit) return
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      const action = isEdit ? updateAction : createAction
      const result = await action({ error: null }, fd)
      if (result.error) {
        setError(result.error)
      } else {
        onOpenChange(false)
        formRef.current?.reset()
        onSuccess()
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
        </SheetHeader>
        <form
          key={exam?.id ?? 'new-exam'}
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-4 pb-4"
        >
          <input type="hidden" name="studentId" value={studentId} />
          {exam && <input type="hidden" name="examId" value={exam.id} />}

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('subject')}</label>
            <input
              name="subject"
              required
              defaultValue={exam?.subject ?? ''}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('title')}</label>
            <input
              name="title"
              required
              defaultValue={exam?.title ?? ''}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('examDate')}</label>
            <input
              name="examDate"
              type="date"
              required
              defaultValue={exam?.examDate ?? ''}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('score')}</label>
              <input
                name="score"
                type="number"
                min={0}
                required
                defaultValue={exam?.score ?? ''}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('maxScore')}</label>
              <input
                name="maxScore"
                type="number"
                min={1}
                defaultValue={exam?.maxScore ?? 100}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('notes')}</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={exam?.notes ?? ''}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <SheetFooter className="flex-row gap-2 sm:justify-end px-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!canEdit || pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
