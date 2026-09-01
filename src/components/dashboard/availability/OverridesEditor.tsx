'use client'

/**
 * Schedule exceptions, shared by the owner route (/teachers/[id]/overrides) and
 * the session's own route (/teacher/overrides).
 *
 * It replaces a form that could only close a whole date, or describe the hours
 * that stayed open. Closing just the morning had to be expressed backwards, and
 * closing a morning AND an evening could not be expressed at all. The three
 * modes here map one-to-one onto the three row kinds the table now holds.
 *
 * Rows are grouped by date because a date can now hold several of them, and the
 * list is unreadable when the same date repeats down the page.
 *
 * Times are wall-clock strings in the org timezone. Never round-trip them
 * through Date or Luxon here — an exception has no instant to convert.
 */

import { useState } from 'react'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, Clock, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeTime } from '@/lib/availability/constants'
import type { ConflictingLesson } from '@/lib/availability-overrides'
import { cn } from '@/lib/utils'

export interface EditableOverride {
  id: string
  override_date: string
  is_available: boolean
  /** HH:MM, or null for a whole-day block */
  start_time: string | null
  end_time: string | null
  reason: string | null
}

type OverrideKind = 'block_day' | 'block_range' | 'special_hours'
type ActionState = {
  error?: string
  /** Lessons already booked inside the range about to be closed. */
  needsLessonConfirm?: boolean
  lessons?: ConflictingLesson[]
  cancelled?: number
  notified?: number
} | null
type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

interface Props {
  overrides: EditableOverride[]
  addAction: FormAction
  updateAction: FormAction
  deleteAction: FormAction
  /** Support mode is read-only; every write would throw at requireMutation. */
  readOnly?: boolean
}

function kindOf(o: Pick<EditableOverride, 'is_available' | 'start_time'>): OverrideKind {
  if (o.is_available) return 'special_hours'
  return o.start_time ? 'block_range' : 'block_day'
}

/** DD/MM/YYYY, matching the rest of the dashboard. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function OverridesEditor({
  overrides,
  addAction,
  updateAction,
  deleteAction,
  readOnly = false,
}: Props) {
  const t = useTranslations('teacherSelf.overrides')
  const tCommon = useTranslations('common')

  const [addState, addFormAction, addPending] = useActionState(addAction, null)
  const [kind, setKind] = useState<OverrideKind>('block_range')
  // Controlled on purpose: when the server comes back asking about the lessons
  // in the range, React 19 has already reset the uncontrolled fields, and the
  // second submit has to describe the same hours as the first.
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')

  const confirming = Boolean(addState?.needsLessonConfirm && addState.lessons?.length)

  // A date can hold several rows now, so print it once and list what it holds.
  const byDate = new Map<string, EditableOverride[]>()
  for (const o of overrides) {
    const list = byDate.get(o.override_date) ?? []
    list.push(o)
    byDate.set(o.override_date, list)
  }
  const dates = [...byDate.keys()].sort()

  const modes: { value: OverrideKind; label: string }[] = [
    { value: 'block_day', label: t('blockDay') },
    { value: 'block_range', label: t('blockHours') },
    { value: 'special_hours', label: t('specialAvailability') },
  ]

  return (
    <div className="space-y-6">
      {dates.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          {tCommon('emptyStates.noResults')}
        </p>
      ) : (
        <div className="space-y-2">
          {dates.map((date) => (
            <div
              key={date}
              className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <span dir="ltr" className="w-24 shrink-0 pt-1.5 text-sm font-medium text-foreground">
                {formatDate(date)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {byDate.get(date)!.map((o) => (
                  <OverrideRow
                    key={o.id}
                    override={o}
                    updateAction={updateAction}
                    deleteAction={deleteAction}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {readOnly ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {t('readOnlyHint')}
        </p>
      ) : (
        <form
          action={addFormAction}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-foreground">{t('addOverrideTitle')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('addOverrideHint')}</p>

          {addState?.error && (
            <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
              {addState.error}
            </div>
          )}

          <input type="hidden" name="type" value={kind} />

          <div className="mt-3 space-y-1.5">
            <span className="block text-sm font-medium text-foreground">{t('type')}</span>
            <div className="flex flex-wrap gap-1.5">
              {modes.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  size="sm"
                  variant={kind === mode.value ? 'default' : 'outline'}
                  aria-pressed={kind === mode.value}
                  onClick={() => setKind(mode.value)}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
            {kind === 'block_day' && (
              <p className="text-xs text-muted-foreground">{t('supersedesRangesHint')}</p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="override_date" className="block text-sm font-medium text-foreground">
                {t('date')}
              </label>
              <Input
                id="override_date"
                name="override_date"
                type="date"
                required
                dir="ltr"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {kind !== 'block_day' && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="start_time" className="block text-sm font-medium text-foreground">
                    {t('from')}
                  </label>
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    required
                    dir="ltr"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="end_time" className="block text-sm font-medium text-foreground">
                    {t('to')}
                  </label>
                  <Input
                    id="end_time"
                    name="end_time"
                    type="time"
                    required
                    dir="ltr"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label htmlFor="reason" className="block text-sm font-medium text-foreground">
                {t('reason')}
              </label>
              <Input
                id="reason"
                name="reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={addPending || confirming}>
              {addPending ? t('saving') : t('add')}
            </Button>
          </div>

          {addState?.cancelled !== undefined && (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
              {t('cancelledAndNotified', {
                cancelled: addState.cancelled,
                notified: addState.notified ?? 0,
              })}
            </p>
          )}

          {confirming && (
            <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t('lessonsInRangeTitle', { count: addState!.lessons!.length })}
              </p>
              <ul className="space-y-1">
                {addState!.lessons!.map((lesson) => (
                  <li key={lesson.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span dir="ltr" className="font-mono text-xs tabular-nums text-foreground">
                      {lesson.start}–{lesson.end}
                    </span>
                    <span className="text-muted-foreground">
                      {lesson.students.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {t('lessonsInRangeHint')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="lesson_action" value="cancel" disabled={addPending}>
                  {t('confirmBlockAndCancel')}
                </Button>
                <Button
                  type="submit"
                  name="lesson_action"
                  value="keep"
                  variant="outline"
                  disabled={addPending}
                >
                  {t('confirmBlockOnly')}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

/**
 * One exception: a read-only summary that flips into an edit form. Keyed by id
 * in the parent, so a successful save re-renders from fresh server props and
 * the row returns to its resting state on its own.
 */
function OverrideRow({
  override: o,
  updateAction,
  deleteAction,
  readOnly,
}: {
  override: EditableOverride
  updateAction: FormAction
  deleteAction: FormAction
  readOnly: boolean
}) {
  const t = useTranslations('teacherSelf.overrides')
  const tCommon = useTranslations('common')
  const [editing, setEditing] = useState(false)
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, null)
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, null)

  const kind = kindOf(o)
  const error = updateState?.error ?? deleteState?.error

  if (editing && !readOnly) {
    return (
      <form action={updateFormAction} className="space-y-1.5">
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="type" value={kind} />
        <input type="hidden" name="override_date" value={o.override_date} />
        <div className="flex flex-wrap items-center gap-1.5">
          {kind !== 'block_day' && (
            <>
              <Input
                name="start_time"
                type="time"
                required
                dir="ltr"
                defaultValue={normalizeTime(o.start_time ?? '')}
                className="w-28"
                aria-label={t('from')}
              />
              <Input
                name="end_time"
                type="time"
                required
                dir="ltr"
                defaultValue={normalizeTime(o.end_time ?? '')}
                className="w-28"
                aria-label={t('to')}
              />
            </>
          )}
          <Input
            name="reason"
            type="text"
            defaultValue={o.reason ?? ''}
            className="w-40"
            aria-label={t('reason')}
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

  const badge =
    kind === 'special_hours'
      ? { icon: Clock, label: t('typeAvailable'), tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
      : kind === 'block_range'
        ? { icon: Ban, label: t('typeBlockedHours'), tone: 'border-amber-200 bg-amber-50 text-amber-700' }
        : { icon: Ban, label: t('typeBlocked'), tone: 'border-destructive/20 bg-destructive/10 text-destructive' }
  const BadgeIcon = badge.icon

  return (
    <div className="space-y-1">
      <div className={cn('flex flex-wrap items-center gap-2 text-sm', deletePending && 'opacity-50')}>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
            badge.tone
          )}
        >
          <BadgeIcon size={11} aria-hidden />
          {badge.label}
        </span>

        <span dir="ltr" className="font-mono text-xs tabular-nums text-foreground">
          {o.start_time && o.end_time
            ? `${normalizeTime(o.start_time)}–${normalizeTime(o.end_time)}`
            : t('wholeDay')}
        </span>

        {o.reason && <span className="text-xs text-muted-foreground">{o.reason}</span>}

        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title={t('editOverride')}
              aria-label={t('editOverride')}
            >
              <Pencil size={12} />
            </button>
            <form action={deleteFormAction} className="flex">
              <input type="hidden" name="id" value={o.id} />
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
