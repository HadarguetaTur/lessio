'use client'

import { useActionState, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { LessonStatus } from '@/lib/lessons/types'
import type { RosterStudent } from '@/lib/lessons/roster'

interface Props {
  currentStatus: LessonStatus
  /** e.g. "Ava Sinclair · 17:00" — names the lesson in the confirmation. */
  lessonLabel?: string
  /** Enrolled students with recorded attendance (decision #46). */
  roster?: RosterStudent[]
  action: (
    prevState: { error: string | null; chargeAlert?: string },
    formData: FormData
  ) => Promise<{ error: string | null; chargeAlert?: string }>
}

/** Who counts as present before anything is touched. */
function initialPresentIds(roster: RosterStudent[], status: LessonStatus): Set<string> {
  if (status === 'no_show') return new Set()
  return new Set(roster.filter((s) => s.attendance !== 'absent').map((s) => s.studentId))
}

export function LessonStatusForm({ currentStatus, lessonLabel, roster = [], action }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, { error: null, chargeAlert: undefined })
  const [selected, setSelected] = useState<LessonStatus>(currentStatus)

  // Attendance per student only means something with more than one student:
  // for one, "completed" or "no-show" already says who came.
  const showRoster = roster.length > 1
  const initialPresent = useMemo(() => initialPresentIds(roster, currentStatus), [roster, currentStatus])
  const [present, setPresent] = useState<Set<string>>(initialPresent)

  const delivered = selected === 'completed' || selected === 'no_show'
  const attendanceChanged =
    showRoster &&
    delivered &&
    (present.size !== initialPresent.size || [...present].some((id) => !initialPresent.has(id)))
  const unchanged = selected === currentStatus && !attendanceChanged

  // 'cancelled' is excluded — cancellation must go through CancelLessonForm (DEV-58)
  const STATUS_LABELS: Partial<Record<LessonStatus, string>> = {
    scheduled: tCommon('status.scheduled'),
    completed: tCommon('status.completed'),
    no_show: tCommon('status.no_show'),
  }

  function selectStatus(next: LessonStatus) {
    setSelected(next)
    if (!showRoster) return
    if (next === 'no_show') setPresent(new Set())
    else if (next === 'completed' && present.size === 0) setPresent(new Set(roster.map((s) => s.studentId)))
  }

  // The status follows the checkboxes: nobody came is a no-show.
  function togglePresent(studentId: string) {
    const next = new Set(present)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    setPresent(next)
    setSelected(next.size === 0 ? 'no_show' : 'completed')
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
          onChange={(e) => selectStatus(e.target.value as LessonStatus)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {(Object.keys(STATUS_LABELS) as LessonStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {showRoster && delivered && (
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t('attendance.title')}</legend>
          <input type="hidden" name="attendance_form" value="1" />
          <p className="text-xs text-muted-foreground">{t('attendance.hint')}</p>
          <ul className="space-y-1.5">
            {roster.map((student) => (
              <li key={student.studentId}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="present"
                    value={student.studentId}
                    checked={present.has(student.studentId)}
                    onChange={() => togglePresent(student.studentId)}
                    className="size-4 accent-primary"
                  />
                  {student.fullName}
                </label>
              </li>
            ))}
          </ul>
          {present.size === 0 && (
            <p className="text-xs text-amber-700">{t('attendance.noneMarked')}</p>
          )}
        </fieldset>
      )}

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

      <Button type="submit" className="w-full" disabled={pending || unchanged}>
        {pending
          ? t('updating')
          : selected === currentStatus && attendanceChanged
            ? t('attendance.update')
            : t('updateStatus')}
      </Button>

      {/* A dropdown showing the current status next to a dead button reads as
          broken unless something says the rule (UX audit F18). */}
      {!pending && unchanged && (
        <p className="text-xs text-muted-foreground">{t('pickDifferentStatus')}</p>
      )}
    </form>
  )
}
