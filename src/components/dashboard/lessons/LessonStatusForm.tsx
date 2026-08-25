'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { LessonStatus } from '@/lib/lessons/types'

interface Props {
  currentStatus: LessonStatus
  /** e.g. "Ava Sinclair · 17:00" — names the lesson in the confirmation. */
  lessonLabel?: string
  action: (
    prevState: { error: string | null; chargeAlert?: string },
    formData: FormData
  ) => Promise<{ error: string | null; chargeAlert?: string }>
}

export function LessonStatusForm({ currentStatus, lessonLabel, action }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, { error: null, chargeAlert: undefined })
  const [selected, setSelected] = useState<LessonStatus>(currentStatus)

  // 'cancelled' is excluded — cancellation must go through CancelLessonForm (DEV-58)
  const STATUS_LABELS: Partial<Record<LessonStatus, string>> = {
    scheduled: tCommon('status.scheduled'),
    completed: tCommon('status.completed'),
    no_show: tCommon('status.no_show'),
  }


  if (currentStatus === 'cancelled') {
    return (
      <p className="text-sm text-muted-foreground italic">{t('cancelledStatus')}</p>
    )
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        // Confirm on submit, not on settle: revalidation remounts this form and
        // wipes any state an after-the-fact effect would key on. A failure is
        // still reported — the action's error renders inline below.
        toast.success(
          lessonLabel
            ? t('statusUpdatedFor', {
                status: STATUS_LABELS[selected] ?? selected,
                lesson: lessonLabel,
              })
            : t('statusUpdated')
        )
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="status">{t('changeStatus')}</Label>
        <select
          id="status"
          name="status"
          value={selected}
          onChange={(e) => setSelected(e.target.value as LessonStatus)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {(Object.keys(STATUS_LABELS) as LessonStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Kept inline rather than in the toast: it explains why no charge was
          created, which the tutor needs to act on, not just acknowledge. */}
      {state.chargeAlert && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
          {state.chargeAlert}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending || selected === currentStatus}>
        {pending ? t('updating') : t('updateStatus')}
      </Button>
    </form>
  )
}
