'use client'

import { useEffect, useRef, useState, useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { GroupPicker } from './GroupPicker'
import type { StudentGroup } from '@/lib/groups'
import type { NewLessonState } from '@/app/(dashboard)/lessons/new/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { LessonStatus } from '@/lib/lessons/types'

const DURATION_VALUES = [30, 45, 60, 90]

const LESSON_FORM_STATUSES: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']

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
  defaultTeacherId,
  calendarFlow,
  variant = 'page',
  onCancel,
  onSuccess,
}: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, initialState)
  const [lessonType, setLessonType] = useState<'individual' | 'group'>('individual')
  const effectiveLessonType = allowGroupLessons ? lessonType : 'individual'
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupStudentIds, setGroupStudentIds] = useState<string[]>([])
  const onSuccessRef = useRef(onSuccess)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmHiddenRef = useRef<HTMLInputElement>(null)
  const calendarConfirmRef = useRef<HTMLInputElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)
  const [calendarConfirmOpen, setCalendarConfirmOpen] = useState(false)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (state.success) {
      onSuccessRef.current?.()
    }
  }, [state.success])

  // Re-open the relevant dialog every time the action settles with a needs-confirm result.
  const wasPendingRef = useRef(false)
  useEffect(() => {
    const justSettled = wasPendingRef.current && !pending
    wasPendingRef.current = pending
    if (!justSettled) return
    if (state.needsAvailabilityConfirm && state.error) {
      setConfirmMessage(state.error)
      setConfirmOpen(true)
    }
    if (state.needsCalendarConfirm) {
      setCalendarConfirmOpen(true)
    }
  }, [pending, state.needsAvailabilityConfirm, state.needsCalendarConfirm, state.error])

  const handleGroupChange = (groupId: string, studentIds: string[]) => {
    setSelectedGroupId(groupId)
    setGroupStudentIds(studentIds)
  }

  const handleConfirmSchedule = () => {
    if (confirmHiddenRef.current) confirmHiddenRef.current.value = '1'
    setConfirmOpen(false)
    if (formRef.current) {
      formRef.current.requestSubmit()
    }
  }

  const handleCancelConfirm = () => {
    if (confirmHiddenRef.current) confirmHiddenRef.current.value = ''
    setConfirmOpen(false)
  }

  const handleConfirmCalendar = () => {
    if (calendarConfirmRef.current) calendarConfirmRef.current.value = '1'
    setCalendarConfirmOpen(false)
    if (formRef.current) formRef.current.requestSubmit()
  }

  const handleCancelCalendar = () => {
    if (calendarConfirmRef.current) calendarConfirmRef.current.value = ''
    setCalendarConfirmOpen(false)
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
      <input
        ref={confirmHiddenRef}
        type="hidden"
        name="confirm_outside_availability"
        defaultValue=""
      />
      <input
        ref={calendarConfirmRef}
        type="hidden"
        name="confirm_calendar_conflict"
        defaultValue=""
      />

      {fixedTeacherId ? (
        <input type="hidden" name="teacher_id" value={fixedTeacherId} />
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
          <select id="student_id" name="student_id" required className={selectClassName}>
            <option value="">{t('selectStudent')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
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
          <Input id="start_time" name="start_time" type="time" required />
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

      <div className="space-y-1.5">
        <Label htmlFor="status">
          {t('fields.status')} <span className="text-destructive">*</span>
        </Label>
        <select
          id="status"
          name="status"
          required
          className={selectClassName}
          defaultValue="scheduled"
        >
          {LESSON_FORM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tCommon(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

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
        else setConfirmOpen(true)
      }}
    >
      <DialogContent dir="rtl">
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
        else setCalendarConfirmOpen(true)
      }}
    >
      <DialogContent dir="rtl">
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
                  {new Date(c.start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(c.end).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
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
        <form ref={formRef} action={formAction} className="space-y-5">
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
        className="bg-card rounded-xl border border-border p-6 space-y-5 shadow-sm"
      >
        {formInner}
      </form>
      {confirmDialog}
      {calendarConflictDialog}
    </>
  )
}
