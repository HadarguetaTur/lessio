'use client'

import { useActionState, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LessonStatus } from '@/lib/lessons/types'
import type { RosterStudent } from '@/lib/lessons/roster'
import type { TeacherOutcomeResult } from '@/app/(dashboard)/teacher/schedule/[id]/actions'

interface Props {
  currentStatus: LessonStatus
  /** Enrolled students with recorded attendance (decision #46). */
  roster?: RosterStudent[]
  action: (
    prevState: TeacherOutcomeResult,
    formData: FormData
  ) => Promise<TeacherOutcomeResult>
}

export function TeacherLessonOutcomeForm({ currentStatus, roster = [], action }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [selected, setSelected] = useState<'completed' | 'no_show'>(
    currentStatus === 'completed' || currentStatus === 'no_show' ? currentStatus : 'completed'
  )
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const showRoster = roster.length > 1
  const initialPresent = useMemo(
    () =>
      currentStatus === 'no_show'
        ? new Set<string>()
        : new Set(roster.filter((s) => s.attendance !== 'absent').map((s) => s.studentId)),
    [roster, currentStatus]
  )
  const [present, setPresent] = useState<Set<string>>(initialPresent)
  const attendanceChanged =
    showRoster && (present.size !== initialPresent.size || [...present].some((id) => !initialPresent.has(id)))
  const unchanged = currentStatus === selected && !attendanceChanged

  const OUTCOME_LABELS: Record<'completed' | 'no_show', string> = {
    completed: tCommon('status.completed'),
    no_show: tCommon('status.no_show'),
  }

  if (currentStatus === 'cancelled') {
    return (
      <p className="text-sm text-muted-foreground italic">{t('cancelledStatus')}</p>
    )
  }

  function selectOutcome(next: 'completed' | 'no_show') {
    setSelected(next)
    setHasSubmitted(false)
    if (!showRoster) return
    if (next === 'no_show') setPresent(new Set())
    else if (present.size === 0) setPresent(new Set(roster.map((s) => s.studentId)))
  }

  function togglePresent(studentId: string) {
    const next = new Set(present)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    setPresent(next)
    setSelected(next.size === 0 ? 'no_show' : 'completed')
    setHasSubmitted(false)
  }

  const showSuccess = hasSubmitted && !pending && state.error === null && !state.chargeAlert

  return (
    <form action={formAction} onSubmit={() => setHasSubmitted(true)} className="space-y-3">
      <div>
        <label htmlFor="outcome" className="block text-sm font-medium text-gray-700 mb-1">
          {t('outcomeUpdate')}
        </label>
        <select
          id="outcome"
          name="status"
          value={selected}
          onChange={(e) => selectOutcome(e.target.value as 'completed' | 'no_show')}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {(Object.keys(OUTCOME_LABELS) as Array<'completed' | 'no_show'>).map((s) => (
            <option key={s} value={s}>
              {OUTCOME_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {showRoster && (
        <fieldset className="space-y-2 rounded-md border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700">{t('attendance.title')}</legend>
          <input type="hidden" name="attendance_form" value="1" />
          <p className="text-xs text-muted-foreground">{t('attendance.hint')}</p>
          <ul className="space-y-1.5">
            {roster.map((student) => (
              <li key={student.studentId}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    name="present"
                    value={student.studentId}
                    checked={present.has(student.studentId)}
                    onChange={() => togglePresent(student.studentId)}
                    className="size-4 accent-blue-600"
                  />
                  {student.fullName}
                </label>
              </li>
            ))}
          </ul>
          {present.size === 0 && <p className="text-xs text-amber-700">{t('attendance.noneMarked')}</p>}
        </fieldset>
      )}

      {state.error && (
        <p className="text-sm text-red-600" role="alert">{state.error}</p>
      )}

      {showSuccess && (
        <p className="text-sm text-green-700" role="status">{t('statusUpdated')}</p>
      )}

      {state.chargeAlert && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md" role="status">
          ⚠️ {state.chargeAlert}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || unchanged}
        className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {pending
          ? t('updating')
          : currentStatus === selected && attendanceChanged
            ? t('attendance.update')
            : t('updateOutcome')}
      </button>
    </form>
  )
}
