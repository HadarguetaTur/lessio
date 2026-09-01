'use client'

import { startTransition, useEffect, useRef, useState, useActionState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { GroupPicker } from './GroupPicker'
import { StudentMultiPicker } from './StudentMultiPicker'
import type { StudentGroup } from '@/lib/groups'
import type { LessonType } from '@/lib/lessons/types'
import type { NewLessonState } from '@/app/(dashboard)/lessons/new/actions'
import type { AvailabilityNotice } from '@/lib/availability/availabilityNotice'
import { DAY_KEYS } from '@/lib/availability/constants'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchSelect } from '@/components/ui/search-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Custom lessons escape the fixed durations; these bounds match the importer. */
const CUSTOM_DURATION_MIN = 5
const CUSTOM_DURATION_MAX = 480

export interface PricingDefaults {
  pairPricePerStudent: number
  groupPricePerStudent: number
}


/**
 * "Not available" on its own is unactionable — it never says what the
 * availability *is*, so a teacher whose weekly grid is simply wrong has no way
 * to tell from this screen. This block shows the windows the slot collided
 * with and links to where they can be changed.
 */
function AvailabilityDetails({ info }: { info: AvailabilityNotice }) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const day = info.dayOfWeek === null ? null : tCommon(`days.${DAY_KEYS[info.dayOfWeek]}`)

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="text-muted-foreground">
        {info.source === 'override'
          ? t('availabilityConfirm.overrideWindowForDate')
          : info.windows.length > 0 && day
            ? t('availabilityConfirm.windowsForDay', { day })
            : t('availabilityConfirm.noWindowsForDay', { day: day ?? '' })}
      </p>

      {info.windows.length > 0 && (
        <ul className="space-y-0.5">
          {info.windows.map((w) => (
            <li
              key={`${w.start}-${w.end}`}
              dir="ltr"
              className="font-mono text-xs tabular-nums text-foreground"
            >
              {w.start}–{w.end}
            </li>
          ))}
        </ul>
      )}

      {info.reason && (
        <p className="text-xs text-muted-foreground">
          {t('availabilityConfirm.overrideReason', { reason: info.reason })}
        </p>
      )}

      {/* New tab on purpose: the form is uncontrolled and half-filled, and
          navigating away in this tab throws the lesson away. */}
      <Link
        href={info.editHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs font-medium text-primary hover:underline"
      >
        {t('availabilityConfirm.editAvailability')}
      </Link>
    </div>
  )
}

const selectClassName = cn(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground',
  'outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'dark:bg-input/30'
)

interface Props {
  students: { id: string; full_name: string }[]
  groups?: StudentGroup[]
  action: (prev: NewLessonState, formData: FormData) => Promise<NewLessonState>
  teachers?: { id: string; full_name: string }[]
  fixedTeacherId?: string
  allowGroupLessons?: boolean
  /** Org price defaults, shown as placeholders on the price field. */
  pricingDefaults?: PricingDefaults
  /** Minimum selectable date YYYY-MM-DD (e.g. backdating / history) */
  minDateStr: string
  initialDate?: string
  /** Default HH:mm for the time field (e.g. next round half hour in org tz) */
  initialTime?: string
  defaultTeacherId?: string
  calendarFlow?: boolean
  variant?: 'page' | 'sheet'
  onCancel?: () => void
  onSuccess?: () => void
  durationValues?: number[]
}

const initialState: NewLessonState = { error: null }

export function NewLessonForm({
  students,
  groups = [],
  action,
  teachers,
  fixedTeacherId,
  allowGroupLessons = true,
  pricingDefaults,
  minDateStr,
  initialDate,
  initialTime,
  defaultTeacherId,
  calendarFlow,
  variant = 'page',
  onCancel,
  onSuccess,
  durationValues = [30, 45, 60, 90],
}: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const activeTeachers = teachers ?? []
  const soleTeacherId = activeTeachers.length === 1 ? activeTeachers[0].id : null
  const [state, formAction, pending] = useActionState(action, initialState)
  const [lessonType, setLessonType] = useState<LessonType>('individual')
  const [studentId, setStudentId] = useState('')
  const effectiveLessonType: LessonType = allowGroupLessons ? lessonType : 'individual'
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupStudentIds, setGroupStudentIds] = useState<string[]>([])
  // Pair lessons name both students explicitly; custom lessons take any number.
  const [pairStudentIds, setPairStudentIds] = useState<[string, string]>(['', ''])
  const [customStudentIds, setCustomStudentIds] = useState<string[]>([])

  const isPair = effectiveLessonType === 'pair'
  const isCustom = effectiveLessonType === 'custom'
  // Every type except individual is priced per student.
  const showPriceField = effectiveLessonType !== 'individual'
  const pricePlaceholder = isPair
    ? pricingDefaults?.pairPricePerStudent?.toString()
    : effectiveLessonType === 'group'
      ? pricingDefaults?.groupPricePerStudent?.toString()
      : undefined
  const onSuccessRef = useRef(onSuccess)
  const formRef = useRef<HTMLFormElement>(null)
  // Payload of the last submit attempt — the confirm dialogs resubmit it as-is,
  // so the lesson survives the confirm round-trip even though React resets the
  // uncontrolled fields once the action settles.
  const lastFormDataRef = useRef<FormData | null>(null)
  // Which confirmations the user has already answered for the payload in
  // flight. The dialogs are derived from the action result rather than mirrored
  // into state by an effect, so there is no window where the result says
  // "confirm needed" and the dialog has not caught up.
  const [dismissed, setDismissed] = useState({ availability: false, calendar: false })

  const confirmMessage = state.error
  const confirmOpen = Boolean(state.needsAvailabilityConfirm && state.error) && !dismissed.availability && !pending
  const calendarConfirmOpen = Boolean(state.needsCalendarConfirm) && !dismissed.calendar && !pending
  // Cancelling a confirm dialog used to leave a blank screen: the banner stayed
  // suppressed for the whole life of the flag, so the Create button looked like
  // it had done nothing. Suppress it only while a dialog is actually up.
  const confirmDismissed =
    (Boolean(state.needsAvailabilityConfirm) || Boolean(state.needsCalendarConfirm)) &&
    !confirmOpen &&
    !calendarConfirmOpen &&
    !pending

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (state.success) {
      onSuccessRef.current?.()
    }
  }, [state.success])

  const handleGroupChange = (groupId: string, studentIds: string[]) => {
    setSelectedGroupId(groupId)
    setGroupStudentIds(studentIds)
  }

  // Submit through the action manually: the browser still runs native
  // constraint validation before firing `submit`, but preventDefault stops
  // React 19 from auto-resetting the uncontrolled fields, so the values are
  // still on screen when a confirm dialog comes back.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    lastFormDataRef.current = fd
    // A fresh attempt: any confirmation answered for the previous payload no
    // longer applies.
    setDismissed({ availability: false, calendar: false })
    startTransition(() => formAction(fd))
  }

  const handleConfirmSchedule = () => {
    const fd = lastFormDataRef.current
    setDismissed((d) => ({ ...d, availability: true }))
    if (!fd) return
    fd.set('confirm_outside_availability', '1')
    startTransition(() => formAction(fd))
  }

  const handleCancelConfirm = () => {
    setDismissed((d) => ({ ...d, availability: true }))
    // The dialog is derived state with no trigger element, so Radix returns
    // focus to <body>. Put the caret on the field they came here to change.
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLInputElement>('#start_time')?.focus()
    })
  }

  const handleConfirmCalendar = () => {
    const fd = lastFormDataRef.current
    setDismissed((d) => ({ ...d, calendar: true }))
    if (!fd) return
    fd.set('confirm_calendar_conflict', '1')
    startTransition(() => formAction(fd))
  }

  const handleCancelCalendar = () => {
    setDismissed((d) => ({ ...d, calendar: true }))
  }

  const dateDefault = initialDate && initialDate >= minDateStr ? initialDate : minDateStr

  const formInner = (
    <>
      {state.error && !state.needsAvailabilityConfirm && !state.needsCalendarConfirm && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          {state.error}
        </div>
      )}

      {confirmDismissed && (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <p>{t('availabilityConfirm.dismissedNotice')}</p>
          {state.availabilityInfo && <AvailabilityDetails info={state.availabilityInfo} />}
        </div>
      )}

      {calendarFlow ? <input type="hidden" name="calendar_flow" value="1" /> : null}

      {fixedTeacherId ? (
        <input type="hidden" name="teacher_id" value={fixedTeacherId} />
      ) : soleTeacherId ? (
        // One teacher in the org: asking "which teacher?" has a single possible
        // answer, so assign it silently rather than making her pick.
        <input type="hidden" name="teacher_id" value={soleTeacherId} />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="teacher_id">
            {t('fields.teacher')} <span className="text-destructive">*</span>
          </Label>
          <select
            id="teacher_id"
            name="teacher_id"
            required
            className={selectClassName}
            defaultValue={defaultTeacherId ?? ''}
          >
            <option value="">{t('selectTeacher')}</option>
            {(teachers ?? []).map((te) => (
              <option key={te.id} value={te.id}>
                {te.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {allowGroupLessons ? (
        <div className="space-y-1.5">
          <Label htmlFor="lesson_type">{t('lessonType')}</Label>
          <select
            id="lesson_type"
            name="lesson_type"
            value={lessonType}
            onChange={(e) => {
              setLessonType(e.target.value as LessonType)
              // Switching type clears the roster picked for the previous one,
              // so a stale student can never ride along on the submit.
              setSelectedGroupId('')
              setGroupStudentIds([])
              setPairStudentIds(['', ''])
              setCustomStudentIds([])
            }}
            className={selectClassName}
          >
            <option value="individual">{t('typeIndividual')}</option>
            <option value="pair">{t('typePair')}</option>
            <option value="group">{t('typeGroup')}</option>
            <option value="custom">{t('typeCustom')}</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="lesson_type" value="individual" />
      )}

      {effectiveLessonType === 'individual' && (
        <div className="space-y-1.5">
          <Label htmlFor="student_id">
            {t('fields.student')} <span className="text-destructive">*</span>
          </Label>
          <SearchSelect
            id="student_id"
            name="student_id"
            required
            value={studentId}
            onChange={setStudentId}
            options={students.map((s) => ({ value: s.id, label: s.full_name }))}
            placeholder={t('selectStudent')}
            emptyText={t('noStudentsFound')}
            clearLabel={tCommon('actions.clear')}
          />
        </div>
      )}

      {isPair && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {([0, 1] as const).map((slot) => (
            <div key={slot} className="space-y-1.5">
              <Label htmlFor={`pair_student_${slot}`}>
                {slot === 0 ? t('studentFirst') : t('studentSecond')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <SearchSelect
                id={`pair_student_${slot}`}
                name="student_ids"
                required
                value={pairStudentIds[slot]}
                onChange={(v) =>
                  setPairStudentIds((prev) => {
                    const next: [string, string] = [prev[0], prev[1]]
                    next[slot] = v
                    return next
                  })
                }
                // The other slot's pick is filtered out, so the same student
                // cannot fill both halves of a pair.
                options={students
                  .filter((s) => s.id !== pairStudentIds[slot === 0 ? 1 : 0])
                  .map((s) => ({ value: s.id, label: s.full_name }))}
                placeholder={t('selectStudent')}
                emptyText={t('noStudentsFound')}
                clearLabel={tCommon('actions.clear')}
              />
            </div>
          ))}
        </div>
      )}

      {effectiveLessonType === 'group' && (
        <>
          <GroupPicker groups={groups} value={selectedGroupId} onChange={handleGroupChange} />
          {groupStudentIds.map((id) => (
            <input key={id} type="hidden" name="student_ids" value={id} />
          ))}
        </>
      )}

      {isCustom && (
        <StudentMultiPicker
          students={students}
          value={customStudentIds}
          onChange={setCustomStudentIds}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="date">
            {t('fields.date')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            min={minDateStr}
            defaultValue={dateDefault}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="start_time">
            {t('fields.time')} <span className="text-destructive">*</span>
          </Label>
          <Input id="start_time" name="start_time" type="time" required defaultValue={initialTime} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="duration_minutes">
          {isCustom ? t('customDuration') : t('fields.duration')}{' '}
          <span className="text-destructive">*</span>
        </Label>
        {isCustom ? (
          <>
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              required
              min={CUSTOM_DURATION_MIN}
              max={CUSTOM_DURATION_MAX}
              step="1"
              defaultValue={60}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">{t('customDurationHint')}</p>
          </>
        ) : (
          <select
            id="duration_minutes"
            name="duration_minutes"
            required
            className={selectClassName}
            defaultValue={durationValues.includes(60) ? 60 : durationValues[0]}
          >
            {durationValues.map((n) => (
              <option key={n} value={n}>
                {t('durationMinutes', { n })}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* A lesson being booked is always 'scheduled'. Asking for an outcome up
          front invites picking one, and marking it 'completed' here quietly
          creates a charge. Recording what happened belongs on the lesson page,
          after it happened. */}
      <input type="hidden" name="status" value="scheduled" />

      {showPriceField && (
        <div className="space-y-1.5">
          <Label htmlFor="price_per_student">
            {isCustom ? t('pricePerStudentRequired') : t('pricePerStudent')}
            {isCustom && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id="price_per_student"
            name="price_per_student"
            type="number"
            step="0.01"
            min="0"
            // Custom lessons have no org default to fall back on, so the price
            // is required rather than optional.
            required={isCustom}
            placeholder={pricePlaceholder ?? t('pricePerStudentPlaceholder')}
            dir="ltr"
          />
          {!isCustom && (
            <p className="text-xs text-muted-foreground">{t('pricePerStudentHint')}</p>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        {variant === 'sheet' ? (
          <Button type="button" variant="outline" className="sm:flex-1" onClick={onCancel}>
            {tCommon('actions.cancel')}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="sm:flex-1" asChild>
            <Link href="/lessons">{tCommon('actions.cancel')}</Link>
          </Button>
        )}
        <Button type="submit" disabled={pending} className="sm:flex-1">
          {pending ? t('creating') : t('create')}
        </Button>
      </div>
    </>
  )

  const confirmDialog = (
    <Dialog
      open={confirmOpen}
      onOpenChange={(next) => {
        if (!next) handleCancelConfirm()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('availabilityConfirm.title')}</DialogTitle>
          <DialogDescription>
            {confirmMessage ?? t('availabilityConfirm.fallback')}
          </DialogDescription>
        </DialogHeader>
        {state.availabilityInfo && <AvailabilityDetails info={state.availabilityInfo} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancelConfirm}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirmSchedule} disabled={pending}>
            {t('availabilityConfirm.scheduleAnyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const calendarConflictDialog = (
    <Dialog
      open={calendarConfirmOpen}
      onOpenChange={(next) => {
        if (!next) handleCancelCalendar()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('calendarConfirm.title')}</DialogTitle>
          <DialogDescription>{t('calendarConfirm.description')}</DialogDescription>
        </DialogHeader>
        {state.calendarConflicts && state.calendarConflicts.length > 0 && (
          <ul className="text-sm space-y-1 border rounded-lg p-3 bg-muted/40">
            {state.calendarConflicts.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs font-medium text-foreground">
                  {c.calendar === 'org' ? t('calendarConfirm.orgCalendar') : t('calendarConfirm.teacherCalendar')}
                </span>
                <span dir="ltr" className="text-xs">
                  {new Date(c.start).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(c.end).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancelCalendar}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirmCalendar} disabled={pending}>
            {t('calendarConfirm.scheduleAnyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (variant === 'sheet') {
    return (
      <>
        <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-5">
          {formInner}
        </form>
        {confirmDialog}
        {calendarConflictDialog}
      </>
    )
  }

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={handleSubmit}
        className="bg-card rounded-xl border border-border p-6 space-y-5 shadow-sm"
      >
        {formInner}
      </form>
      {confirmDialog}
      {calendarConflictDialog}
    </>
  )
}
