'use client'

/**
 * The weekly availability grid, shared by the owner route
 * (/teachers/[id]/availability) and the session's own route
 * (/teacher/availability).
 *
 * It replaces a form that could only append one window to one day: defining a
 * real working week meant five separate submissions, and correcting a window
 * meant deleting and retyping it. Both are now one action, which matters most
 * for a tutor whose imported grid describes their booked lessons rather than
 * their working hours.
 *
 * Times are wall-clock strings in the org timezone. Never round-trip them
 * through Date or Luxon here — a weekly rule has no instant to convert.
 */

import { useState } from 'react'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DAY_KEYS } from '@/lib/availability/constants'
import { cn } from '@/lib/utils'

export interface EditableWindow {
  id: string
  day_of_week: number
  /** HH:MM */
  start_time: string
  end_time: string
}

type ActionState = { error: string } | null
type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

interface Props {
  windows: EditableWindow[]
  addAction: FormAction
  updateAction: FormAction
  deleteAction: FormAction
  /** Support mode is read-only; every write would throw at requireMutation. */
  readOnly?: boolean
}

export function WeeklyAvailabilityEditor({
  windows,
  addAction,
  updateAction,
  deleteAction,
  readOnly = false,
}: Props) {
  const t = useTranslations('teacherSelf.availability')
  const tCommon = useTranslations('common')

  const [addState, addFormAction, addPending] = useActionState(addAction, null)
  const [selectedDays, setSelectedDays] = useState<number[]>([])

  const byDay = DAY_KEYS.map((_, day) => windows.filter((w) => w.day_of_week === day))

  const toggleDay = (day: number) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {byDay.map((dayWindows, day) => (
          <div
            key={DAY_KEYS[day]}
            className="flex items-start gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <span className="w-16 shrink-0 pt-1.5 text-sm font-medium text-foreground">
              {tCommon(`days.${DAY_KEYS[day]}`)}
            </span>

            {dayWindows.length === 0 ? (
              <span className="pt-1.5 text-sm text-muted-foreground">{t('emptyDay')}</span>
            ) : (
              <div className="flex min-w-0 flex-wrap gap-2">
                {dayWindows.map((w) => (
                  <WindowChip
                    key={w.id}
                    window={w}
                    updateAction={updateAction}
                    deleteAction={deleteAction}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {readOnly ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {t('readOnlyHint')}
        </p>
      ) : (
        <form
          action={addFormAction}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-foreground">{t('addSlotTitle')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('selectDaysHint')}</p>

          {addState?.error && (
            <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
              {addState.error}
            </div>
          )}

          {selectedDays.map((d) => (
            <input key={d} type="hidden" name="day_of_week" value={d} />
          ))}

          <div className="mt-3 space-y-1.5">
            <span className="block text-sm font-medium text-foreground">{t('days')}</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_KEYS.map((key, day) => {
                const selected = selectedDays.includes(day)
                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => toggleDay(day)}
                  >
                    {tCommon(`days.${key}`)}
                  </Button>
                )
              })}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedDays(selectedDays.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}
              >
                {selectedDays.length === 7 ? t('clearDays') : t('selectAll')}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="start_time" className="block text-sm font-medium text-foreground">
                {t('from')}
              </label>
              <Input id="start_time" name="start_time" type="time" required dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="end_time" className="block text-sm font-medium text-foreground">
                {t('to')}
              </label>
              <Input id="end_time" name="end_time" type="time" required dir="ltr" />
            </div>

            <Button type="submit" disabled={addPending || selectedDays.length === 0}>
              {addPending ? t('saving') : t('add')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * One window: a read-only range that flips into two time inputs. Keyed by id in
 * the parent, so a successful save re-renders from fresh server props and the
 * chip returns to its resting state on its own.
 */
function WindowChip({
  window: w,
  updateAction,
  deleteAction,
  readOnly,
}: {
  window: EditableWindow
  updateAction: FormAction
  deleteAction: FormAction
  readOnly: boolean
}) {
  const t = useTranslations('teacherSelf.availability')
  const tCommon = useTranslations('common')
  const [editing, setEditing] = useState(false)
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, null)
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, null)

  const error = updateState?.error ?? deleteState?.error

  if (editing && !readOnly) {
    return (
      <form action={updateFormAction} className="space-y-1.5">
        <input type="hidden" name="id" value={w.id} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            name="start_time"
            type="time"
            required
            dir="ltr"
            defaultValue={w.start_time}
            className="w-28"
            aria-label={t('from')}
          />
          <Input
            name="end_time"
            type="time"
            required
            dir="ltr"
            defaultValue={w.end_time}
            className="w-28"
            aria-label={t('to')}
          />
          <Button type="submit" size="sm" disabled={updatePending}>
            {updatePending ? t('saving') : tCommon('actions.save')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X size={14} aria-hidden />
            <span className="sr-only">{tCommon('actions.cancel')}</span>
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    )
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm text-foreground',
          deletePending && 'opacity-50'
        )}
      >
        <span dir="ltr" className="font-mono text-xs tabular-nums">
          {w.start_time}–{w.end_time}
        </span>

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title={t('editWindow')}
              aria-label={t('editWindow')}
            >
              <Pencil size={12} />
            </button>
            <form action={deleteFormAction} className="flex">
              <input type="hidden" name="id" value={w.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="text-muted-foreground transition-colors hover:text-destructive"
                title={tCommon('actions.delete')}
                aria-label={tCommon('actions.delete')}
              >
                <Trash2 size={12} />
              </button>
            </form>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
