'use client'

import { startTransition, useEffect, useRef, useState, useActionState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { GroupPicker } from './GroupPicker'
import type { StudentGroup } from '@/lib/groups'
import type { NewLessonState } from '@/app/(dashboard)/lessons/new/actions'
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

const DURATION_VALUES = [30, 45, 60, 90]


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
}

const initialState: NewLessonState = { error: null }

export function NewLessonForm({
  students,
  groups = [],
  action,
  teachers,
  fixedTeacherId,
  allowGroupLessons = true,
  minDateStr,
  initialDate,
  initialTime,
  defaultTeacherId,
  calendarFlow,
  variant = 'page',
  onCancel,
  onSuccess,
}: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const activeTeachers = teachers ?? []
  const soleTeacherId = activeTeachers.length === 1 ? activeTeachers[0].id : null
  const [state, formAction, pending] = useActionState(action, initialState)
  const [lessonType, setLessonType] = useState<'individual' | 'group'>('individual')
  const [studentId, setStudentId] = useState('')
  const effectiveLessonType = allowGroupLessons ? lessonType : 'individual'
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupStudentIds, setGroupStudentIds] = useState<string[]>([])
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
              setLessonType(e.target.value as 'individual' | 'group')
              setSelectedGroupId('')
              setGroupStudentIds([])
            }}
            className={selectClassName}
          >
            <option value="individual">{t('typeIndividual')}</option>
            <option value="group">{t('typeGroup')}</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="lesson_type" value="individual" />
      )}

      {effectiveLessonType === 'individual' ? (
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
      ) : (
        <>
          <GroupPicker groups={groups} value={selectedGroupId} onChange={handleGroupChange} />
          {groupStudentIds.map((id) => (
            <input key={id} type="hidden" name="student_ids" value={id} />
          ))}
        </>
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
          {t('fields.duration')} <span className="text-destructive">*</span>
        </Label>
        <select id="duration_minutes" name="duration_minutes" required className={selectClassName} defaultValue="60">
          {DURATION_VALUES.map((n) => (
            <option key={n} value={n}>
              {t('durationMinutes', { n })}
            </option>
          ))}
        </select>
      </div>

      {/* A lesson being booked is always 'scheduled'. Asking for an outcome up
          front invites picking one, and marking it 'completed' here quietly
          creates a charge. Recording what happened belongs on the lesson page,
          after it happened. */}
      <input type="hidden" name="status" value="scheduled" />

      {effectiveLessonType === 'group' && (
        <div className="space-y-1.5">
          <Label htmlFor="price_per_student">{t('pricePerStudent')}</Label>
          <Input
            id="price_per_student"
            name="price_per_student"
            type="number"
            step="0.01"
            min="0"
            placeholder={t('pricePerStudentPlaceholder')}
            dir="ltr"
          />
          <p className="text-xs text-muted-foreground">{t('pricePerStudentHint')}</p>
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
