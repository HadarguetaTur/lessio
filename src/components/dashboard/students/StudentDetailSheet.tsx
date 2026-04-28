'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useActionState } from 'react'
import { Tabs } from 'radix-ui'
import {
  Pencil, MoreVertical, Archive, RotateCcw, AlertCircle,
  Loader2, FileBarChart, Phone, BookOpen,
  GraduationCap, CalendarDays, Wallet, ClipboardList,
  Search, X, Check,
} from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { Student, StudentLesson, StudentFinancial, StudentPrimaryParent } from '@/lib/students'
import type { HomeworkAssignment } from '@/lib/homework'
import { SubscriptionForm } from '@/components/dashboard/billing/SubscriptionForm'
import { GoalsSection } from '@/components/dashboard/students/GoalsSection'
import {
  updateStudent,
  archiveStudent,
  restoreStudent,
  fetchStudentParent,
  fetchStudentLessons,
  fetchStudentFinancial,
  fetchStudentHomework,
  fetchStudentSubscriptions,
  fetchStudentGoals,
  fetchOrgParents,
} from '@/app/(dashboard)/students/actions'
import {
  createGoalAction,
  updateGoalStatusAction,
  deleteGoalAction,
  type GoalActionState,
} from '@/app/(dashboard)/students/[id]/actions'
import type { Subscription } from '@/lib/subscriptions'
import type { StudentGoal } from '@/lib/goals'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<Student['status'], string> = {
  active:   'bg-emerald-500',
  on_hold:  'bg-amber-400',
  inactive: 'bg-slate-400',
}

const STATUS_BADGE_CLASS: Record<Student['status'], string> = {
  active:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_hold:  'bg-amber-50 text-amber-700 border-amber-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
}

const HOMEWORK_STATUS_CLASS: Record<HomeworkAssignment['status'], string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  done:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
}

const CHARGE_STATUS_CLASS: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  invoiced: 'bg-blue-50 text-blue-700 border-blue-200',
  paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const LESSON_STATUS_CLASS: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  no_show:   'bg-slate-100 text-slate-500 border-slate-200',
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}
function formatMonth(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(iso))
}
function groupByMonth<T extends { start_at: string }>(items: T[]) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = item.start_at.substring(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }))
}

function StatusBadge({ status }: { status: Student['status'] }) {
  const t = useTranslations('students')
  const dot = STATUS_DOT[status] ?? STATUS_DOT.inactive
  const badge = STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.inactive
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border', badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {t(`status.${status}` as 'status.active')}
    </span>
  )
}

function InlineBadge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', className)}>
      {children}
    </span>
  )
}

function PhoneLink({ phone, label }: { phone: string; label: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
    >
      <Phone size={12} className="shrink-0 opacity-60" />
      {phone}
    </a>
  )
}

type LazyStatus = 'idle' | 'loading' | 'loaded' | 'error'
interface Lazy<T> { status: LazyStatus; data?: T; error?: string }
const IDLE = { status: 'idle' as const }

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-sm overflow-hidden', className)}>
      {title && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{title}</p>
        </div>
      )}
      {children}
    </div>
  )
}

function DataRow({ label, children, interactive }: { label: string; children: React.ReactNode; interactive?: boolean }) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-4 px-4 py-3 text-sm',
      interactive && 'hover:bg-muted/40 transition-colors rounded-xl cursor-default',
    )}>
      <dt className="text-muted-foreground shrink-0 min-w-[90px]">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

// ── Parent search select ─────────────────────────────────────────────────────

function ParentSearchSelect({
  parents,
  value,
  onChange,
}: {
  parents: { id: string; full_name: string; phone: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useTranslations('students')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selected = parents.find((p) => p.id === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return parents
    const q = query.trim().toLowerCase()
    return parents.filter(
      (p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q)
    )
  }, [parents, query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name="parent_id" value={value} />

      {!open && selected ? (
        <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 text-right truncate text-foreground"
          >
            {selected.full_name}
            <span className="text-muted-foreground mr-1.5">({selected.phone})</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 mr-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('card.removeParent')}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={t('card.searchParentPlaceholder')}
            className="flex h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoComplete="off"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {!value && (
            <button
              type="button"
              onClick={() => handleSelect('')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t('card.noParentOption')}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">{t('card.noParentsFound')}</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-right',
                  p.id === value && 'bg-primary/5'
                )}
              >
                {p.id === value && <Check size={13} className="shrink-0 text-primary" />}
                <span className="flex-1 truncate">
                  {p.full_name}
                  <span className="text-muted-foreground mr-1.5 text-xs">({p.phone})</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({ student, teachers, currentParentId, onDone, onCancel, variant = 'admin' }: {
  student: Student
  teachers: { id: string; full_name: string }[]
  currentParentId: string | null
  onDone: () => void
  onCancel: () => void
  variant?: 'admin' | 'teacher'
}) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const action = useMemo(() => updateStudent.bind(null, student.id), [student.id])
  const [state, formAction, pending] = useActionState(action, null)
  const submitted = useRef(false)
  const [orgParents, setOrgParents] = useState<{ id: string; full_name: string; phone: string }[]>([])
  const [parentsLoading, setParentsLoading] = useState(true)
  const [selectedParentId, setSelectedParentId] = useState(currentParentId ?? '')

  useEffect(() => {
    if (submitted.current && !pending && !state?.error) onDone()
  }, [state, pending, onDone])

  useEffect(() => {
    if (variant === 'teacher') {
      setParentsLoading(false)
      return
    }
    fetchOrgParents().then((r) => {
      if ('data' in r) setOrgParents(r.data)
      setParentsLoading(false)
    })
  }, [variant])

  const isTeacher = variant === 'teacher'

  return (
    <form action={formAction} onSubmit={() => { submitted.current = true }} className="space-y-6">
      {state?.error && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-xl">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      {isTeacher ? (
        <>
          <input type="hidden" name="full_name" value={student.full_name} />
          <input type="hidden" name="phone" value={student.phone ?? ''} />
          <input type="hidden" name="status" value={student.status} />
          <input type="hidden" name="teacher_id" value={student.teacher_id ?? ''} />
        </>
      ) : null}

      <SectionCard title={t('card.contactDetails')} className="overflow-visible">
        <div className="p-4 grid grid-cols-1 gap-4">
          {isTeacher ? (
            <>
              <div className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('fields.fullName')}</span>
                <p className="font-medium">{student.full_name}</p>
              </div>
              {student.phone ? (
                <div className="space-y-1 text-sm">
                  <span className="text-muted-foreground">{t('fields.phone')}</span>
                  <p className="font-mono" dir="ltr">{student.phone}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">{t('fields.fullName')} <span className="text-destructive">*</span></Label>
                <Input id="full_name" name="full_name" defaultValue={student.full_name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t('fields.phone')}</Label>
                <Input id="phone" name="phone" type="tel" defaultValue={student.phone ?? ''} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.primaryParent')}</Label>
                {parentsLoading ? (
                  <Skeleton className="h-9 w-full rounded-md" />
                ) : (
                  <ParentSearchSelect
                    parents={orgParents}
                    value={selectedParentId}
                    onChange={setSelectedParentId}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('card.academicSection')}>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="grade">{t('fields.grade')}</Label>
            <Input id="grade" name="grade" defaultValue={student.grade ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weekly_quota">{t('fields.weeklyQuotaShort')}</Label>
            <Input id="weekly_quota" name="weekly_quota" type="number" min={1} max={20} defaultValue={student.weekly_quota ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="level">{t('fields.level')}</Label>
            <Input id="level" name="level" defaultValue={student.level ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="focused_subject">{t('fields.focusedSubject')}</Label>
            <Input id="focused_subject" name="focused_subject" defaultValue={student.focused_subject ?? ''} />
          </div>
          {!isTeacher && teachers.length > 0 && (
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="teacher_id">{t('fields.teacher')}</Label>
              <select
                id="teacher_id"
                name="teacher_id"
                defaultValue={student.teacher_id ?? ''}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t('fields.noTeacher')}</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('card.generalSection')}>
        <div className="p-4 space-y-4">
          {!isTeacher ? (
            <div className="space-y-1.5">
              <Label htmlFor="status">{t('fields.status')}</Label>
              <select
                id="status" name="status" defaultValue={student.status}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">{t('status.active')}</option>
                <option value="on_hold">{t('status.on_hold')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <textarea
              id="notes" name="notes" rows={4} defaultValue={student.notes ?? ''}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>
      </SectionCard>

      <div className="flex gap-3 sticky bottom-0 bg-background pt-2 pb-1 border-t border-border">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending && <Loader2 size={13} className="animate-spin" />}
          {pending ? tCommon('actions.saving') : tCommon('actions.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>{tCommon('actions.cancel')}</Button>
      </div>
    </form>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ student, parent, parentLoading }: {
  student: Student
  parent: StudentPrimaryParent | null | undefined
  parentLoading: boolean
}) {
  const t = useTranslations('students')
  return (
    <div className="space-y-4">
      <SectionCard title={t('card.contactDetails')}>
        <dl className="divide-y divide-border/60">
          <DataRow label={t('card.parentName')}>
            {parentLoading
              ? <Skeleton className="h-4 w-32" />
              : parent?.full_name
                ? <span className="font-medium">{parent.full_name}</span>
                : <span className="text-muted-foreground">—</span>
            }
          </DataRow>
          <DataRow label={t('fields.phone')}>
            {student.phone
              ? <PhoneLink phone={student.phone} label={student.phone} />
              : <span className="text-muted-foreground">—</span>
            }
          </DataRow>
          <DataRow label={t('card.parentPhone')}>
            {parentLoading
              ? <Skeleton className="h-4 w-28" />
              : parent?.phone
                ? <PhoneLink phone={parent.phone} label={parent.phone} />
                : <span className="text-muted-foreground">—</span>
            }
          </DataRow>
          <DataRow label={t('fields.email')}>
            <span className="text-muted-foreground">—</span>
          </DataRow>
        </dl>
      </SectionCard>

      <SectionCard title={t('card.accountStatus')}>
        <dl className="divide-y divide-border/60">
          <DataRow label={t('card.balance')}>
            <span className="text-muted-foreground">—</span>
          </DataRow>
          <DataRow label={t('card.noSubscription')}>
            <span className="text-muted-foreground text-xs">—</span>
          </DataRow>
        </dl>
      </SectionCard>

      {student.notes ? (
        <SectionCard title={t('card.pedagogicalNotes')}>
          <p className="px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">{student.notes}</p>
        </SectionCard>
      ) : null}

      <p className="text-xs text-muted-foreground px-1">
        {t('card.registered')} {formatDate(student.created_at)}
      </p>
    </div>
  )
}

// ── Tab: Academic ─────────────────────────────────────────────────────────────

function AcademicTab({ student }: { student: Student }) {
  const t = useTranslations('students')
  const fields = [
    { label: t('fields.teacher'),       value: student.teacher_name },
    { label: t('fields.focusedSubject'), value: student.focused_subject },
    { label: t('fields.level'),          value: student.level },
    { label: t('fields.grade'),          value: student.grade },
    { label: t('fields.weeklyQuotaShort'), value: student.weekly_quota != null ? `${student.weekly_quota} ${t('fields.weeklyQuotaSuffix')}` : null },
  ]
  const hasAny = fields.some((f) => f.value)

  return (
    <SectionCard>
      {hasAny ? (
        <dl className="divide-y divide-border/60">
          {fields.map(({ label, value }) => (
            <DataRow key={label} label={label}>
              {value ?? <span className="text-muted-foreground">—</span>}
            </DataRow>
          ))}
        </dl>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <GraduationCap size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('card.academicEmpty')}</p>
          <p className="text-xs text-muted-foreground/70">{t('card.academicEmptyHint')}</p>
        </div>
      )}
    </SectionCard>
  )
}

// ── Tab: History ──────────────────────────────────────────────────────────────

function HistoryTab({ lazy }: { lazy: Lazy<StudentLesson[]> }) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  if (lazy.status === 'idle' || lazy.status === 'loading') {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full rounded-xl" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    )
  }
  if (lazy.status === 'error') return <p className="text-sm text-destructive py-4">{lazy.error}</p>

  const lessons = lazy.data ?? []
  if (lessons.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 gap-3 text-center">
        <CalendarDays size={36} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">{t('card.noLessonsRegistered')}</p>
      </div>
    )
  }

  const now = new Date()
  const completed = lessons.filter((l) => l.status === 'completed').length
  const groups = groupByMonth(lessons)

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted/40 rounded-xl px-4 py-2.5 text-xs text-muted-foreground">
        <span>{t('card.totalLessons', { count: lessons.length })}</span>
        <span className="text-border">|</span>
        <span>{t('card.completedLessons', { count: completed })}</span>
      </div>

      {groups.map(({ month, items }) => {
        const monthDate = new Date(items[0].start_at)
        const isFuture = monthDate > now
        return (
          <div key={month}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {formatMonth(items[0].start_at)}
              </p>
              {isFuture && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                  {t('card.future')}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
            </div>
            <SectionCard>
              <div className="divide-y divide-border/60">
                {items.map((lesson) => {
                  const d = new Date(lesson.start_at)
                  return (
                    <div key={lesson.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className={cn('w-1 self-stretch rounded-full shrink-0 my-0.5', {
                        'bg-emerald-400': lesson.status === 'completed',
                        'bg-blue-400':    lesson.status === 'scheduled',
                        'bg-red-300':     lesson.status === 'cancelled',
                        'bg-slate-300':   lesson.status === 'no_show',
                      })} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
                          <span className="text-muted-foreground font-normal mx-1">·</span>
                          {d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lesson.teacher_name} · {lesson.duration_minutes} {t('card.minutesSuffix')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        {lesson.amount != null && (
                          <span className="text-sm text-muted-foreground tabular-nums">₪{lesson.amount}</span>
                        )}
                        <InlineBadge className={LESSON_STATUS_CLASS[lesson.status]}>{tCommon(`status.${lesson.status}` as 'status.scheduled')}</InlineBadge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Financial ────────────────────────────────────────────────────────────

function SubscriptionStatusBadge({ sub }: { sub: Subscription }) {
  const t = useTranslations('students')
  if (sub.is_paused) return <InlineBadge className="bg-amber-50 text-amber-700 border-amber-200">{t('card.subscriptionPaused')}</InlineBadge>
  if (sub.end_date && new Date(sub.end_date) < new Date()) return <InlineBadge className="bg-slate-100 text-slate-500 border-slate-200">{t('card.subscriptionEnded')}</InlineBadge>
  return <InlineBadge className="bg-emerald-50 text-emerald-700 border-emerald-200">{t('card.subscriptionActive')}</InlineBadge>
}

function FinancialTab({
  lazy,
  subscriptionsLazy,
  studentId,
  canManage,
  onRefreshSubscriptions,
}: {
  lazy: Lazy<StudentFinancial>
  subscriptionsLazy: Lazy<Subscription[]>
  studentId: string
  canManage?: boolean
  onRefreshSubscriptions?: () => void
}) {
  const t = useTranslations('students')
  const tSub = useTranslations('subscriptions')
  const tCommon = useTranslations('common')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSubId, setEditingSubId] = useState<string | null>(null)

  if (lazy.status === 'idle' || lazy.status === 'loading') {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
      </div>
    )
  }
  if (lazy.status === 'error') return <p className="text-sm text-destructive py-4">{lazy.error}</p>

  const fin = lazy.data!
  const isDebt = fin.balance < 0
  const subs = subscriptionsLazy.data ?? []

  return (
    <div className="space-y-4">
      {/* Balance hero */}
      <div className={cn(
        'rounded-2xl border p-5 space-y-1',
        isDebt ? 'border-red-200 bg-gradient-to-br from-red-50 to-red-50/30' : 'border-border bg-card',
      )}>
        <p className="text-xs text-muted-foreground">{t('card.balance')}</p>
        <p className={cn('text-3xl font-bold tabular-nums tracking-tight', isDebt ? 'text-red-600' : 'text-foreground')}>
          {isDebt ? '-' : ''}₪{Math.abs(fin.balance).toLocaleString('he-IL')}
        </p>
        {fin.primary_parent_name
          ? <p className="text-xs text-muted-foreground pt-0.5">{t('card.parentLabel')} {fin.primary_parent_name}</p>
          : <p className="text-xs text-muted-foreground/60">{t('card.noParent')}</p>
        }
      </div>

      <SectionCard title={t('card.subscriptions')}>
        {subscriptionsLazy.status === 'loading' ? (
          <div className="p-4"><Skeleton className="h-14 w-full rounded-xl" /></div>
        ) : subs.length === 0 && !showAddForm ? (
          <div className="px-4 py-6 flex flex-col items-center text-center gap-1.5">
            <Wallet size={28} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t('card.noActiveSubscription')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {subs.map((sub) => (
              <div key={sub.id}>
                {editingSubId === sub.id ? (
                  <div className="p-2">
                    <SubscriptionForm
                      studentId={studentId}
                      subscription={sub}
                      onSuccess={() => { setEditingSubId(null); onRefreshSubscriptions?.() }}
                      onCancel={() => setEditingSubId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3">
                    <div>
                      <p className="text-sm font-medium">{sub.subscription_type ?? t('card.subscriptions')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {sub.start_date}{sub.end_date ? ` — ${sub.end_date}` : ` — ${t('card.unlimited')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">₪{Number(sub.monthly_amount).toLocaleString('he-IL')}/{t('card.perMonth')}</span>
                      <SubscriptionStatusBadge sub={sub} />
                      {canManage && (
                        <button
                          onClick={() => { setShowAddForm(false); setEditingSubId(sub.id) }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canManage && showAddForm && (
          <div className="p-2">
            <SubscriptionForm
              studentId={studentId}
              onSuccess={() => { setShowAddForm(false); onRefreshSubscriptions?.() }}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}
        {canManage && !showAddForm && editingSubId === null && (
          <div className="px-4 pb-3 pt-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-primary hover:underline"
            >
              + {tSub('addSubscription')}
            </button>
          </div>
        )}
      </SectionCard>

      {fin.monthly_billings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
            {t('card.monthlyBillingSection')}
          </p>
          <SectionCard>
            <div className="divide-y divide-border/60">
              {fin.monthly_billings.map((billing) => (
                <div key={billing.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3">
                  <div>
                    <p className="text-sm font-medium">{billing.billing_month}</p>
                    <p className="text-xs text-muted-foreground">
                      {billing.is_approved ? t('card.billingApproved') : t('card.billingPendingApproval')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">₪{Number(billing.total_amount).toLocaleString('he-IL')}</span>
                    <InlineBadge className={billing.is_paid ? CHARGE_STATUS_CLASS.paid : CHARGE_STATUS_CLASS.pending}>
                      {billing.is_paid ? t('card.billingPaid') : t('card.billingOpen')}
                    </InlineBadge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {fin.recent_charges.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
            {t('card.recentCharges')}
          </p>
          <SectionCard>
            <div className="divide-y divide-border/60">
              {fin.recent_charges.map((c) => {
                const chargeTypeKey = c.charge_type === 'lesson' ? 'chargeTypeLesson' : c.charge_type === 'cancellation' ? 'chargeTypeCancellation' : 'chargeTypeManual'
                return (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3">
                    <div>
                      <p className="text-sm font-medium">{t(`card.${chargeTypeKey}`)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">₪{Number(c.amount).toLocaleString('he-IL')}</span>
                      <InlineBadge className={CHARGE_STATUS_CLASS[c.status]}>{tCommon(`chargeStatus.${c.status}` as 'chargeStatus.pending')}</InlineBadge>
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {fin.recent_charges.length === 0 && fin.monthly_billings.length === 0 && fin.primary_parent_id && (
        <div className="flex flex-col items-center py-10 gap-2 text-center">
          <ClipboardList size={28} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{t('card.noCharges')}</p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Homework ─────────────────────────────────────────────────────────────

function HomeworkTab({ lazy }: { lazy: Lazy<HomeworkAssignment[]> }) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  if (lazy.status === 'idle' || lazy.status === 'loading') {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
      </div>
    )
  }
  if (lazy.status === 'error') return <p className="text-sm text-destructive py-4">{lazy.error}</p>

  const assignments = lazy.data ?? []
  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 gap-3 text-center">
        <BookOpen size={36} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">{t('card.noHomework')}</p>
      </div>
    )
  }

  return (
    <SectionCard>
      <div className="divide-y divide-border/60">
        {assignments.map((hw) => {
          const statusClass = HOMEWORK_STATUS_CLASS[hw.status] ?? HOMEWORK_STATUS_CLASS.pending
          return (
            <div key={hw.id} className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{hw.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('card.assignedDate')} {formatDate(hw.createdAt)}
                  {hw.dueDate && <> · {t('card.dueDate')} {formatDate(hw.dueDate + 'T00:00:00')}</>}
                </p>
              </div>
              <InlineBadge className={cn('shrink-0 mt-0.5', statusClass)}>{tCommon(`homeworkStatus.${hw.status}` as 'homeworkStatus.pending')}</InlineBadge>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

const TAB_VALUES_ADMIN = ['overview', 'academic', 'history', 'financial', 'homework', 'goals'] as const
const TAB_VALUES_TEACHER = ['overview', 'academic', 'history', 'homework', 'goals'] as const

// ── Main component ────────────────────────────────────────────────────────────

interface StudentDetailSheetProps {
  student: Student | null
  teachers: { id: string; full_name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage?: boolean
  variant?: 'admin' | 'teacher'
}

export function StudentDetailSheet({
  student,
  teachers,
  open,
  onOpenChange,
  canManage,
  variant = 'admin',
}: StudentDetailSheetProps) {
  const tabValues = variant === 'teacher' ? TAB_VALUES_TEACHER : TAB_VALUES_ADMIN
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [parent, setParent] = useState<StudentPrimaryParent | null | undefined>(undefined)
  const [parentLoading, setParentLoading] = useState(false)
  const [lessonsLazy, setLessonsLazy] = useState<Lazy<StudentLesson[]>>(IDLE)
  const [financialLazy, setFinancialLazy] = useState<Lazy<StudentFinancial>>(IDLE)
  const [homeworkLazy, setHomeworkLazy] = useState<Lazy<HomeworkAssignment[]>>(IDLE)
  const [subscriptionsLazy, setSubscriptionsLazy] = useState<Lazy<Subscription[]>>(IDLE)
  const [goalsLazy, setGoalsLazy] = useState<Lazy<StudentGoal[]>>(IDLE)

  useEffect(() => {
    setIsEditing(false)
    setActiveTab('overview')
    setParent(undefined)
    setLessonsLazy(IDLE)
    setFinancialLazy(IDLE)
    setHomeworkLazy(IDLE)
    setSubscriptionsLazy(IDLE)
    setGoalsLazy(IDLE)
    if (!student) return
    setParentLoading(true)
    fetchStudentParent(student.id).then((result) => {
      setParent('data' in result ? result.data : null)
      setParentLoading(false)
    })
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = async (tab: string) => {
    setActiveTab(tab)
    if (!student) return
    if (tab === 'history' && lessonsLazy.status === 'idle') {
      setLessonsLazy({ status: 'loading' })
      const r = await fetchStudentLessons(student.id)
      setLessonsLazy('error' in r ? { status: 'error', error: r.error } : { status: 'loaded', data: r.data })
    }
    if (tab === 'financial' && financialLazy.status === 'idle') {
      setFinancialLazy({ status: 'loading' })
      setSubscriptionsLazy({ status: 'loading' })
      const [r, sr] = await Promise.all([
        fetchStudentFinancial(student.id),
        fetchStudentSubscriptions(student.id),
      ])
      setFinancialLazy('error' in r ? { status: 'error', error: r.error } : { status: 'loaded', data: r.data })
      setSubscriptionsLazy('error' in sr ? { status: 'error', error: sr.error } : { status: 'loaded', data: sr.data })
    }
    if (tab === 'homework' && homeworkLazy.status === 'idle') {
      setHomeworkLazy({ status: 'loading' })
      const r = await fetchStudentHomework(student.id)
      setHomeworkLazy('error' in r ? { status: 'error', error: r.error } : { status: 'loaded', data: r.data })
    }
    if (tab === 'goals' && goalsLazy.status === 'idle') {
      setGoalsLazy({ status: 'loading' })
      const r = await fetchStudentGoals(student.id)
      setGoalsLazy('error' in r ? { status: 'error', error: r.error } : { status: 'loaded', data: r.data })
    }
  }

  const refreshGoals = async () => {
    if (!student) return
    const r = await fetchStudentGoals(student.id)
    setGoalsLazy('error' in r ? { status: 'error', error: r.error } : { status: 'loaded', data: r.data })
  }


  const handleArchive = async () => { if (student) { await archiveStudent(student.id); onOpenChange(false) } }
  const handleRestore = async () => { if (student) { await restoreStudent(student.id); onOpenChange(false) } }

  const refreshSubscriptions = async () => {
    if (!student) return
    setSubscriptionsLazy({ status: 'loading' })
    const sr = await fetchStudentSubscriptions(student.id)
    setSubscriptionsLazy('error' in sr ? { status: 'error', error: sr.error } : { status: 'loaded', data: sr.data })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[720px] p-0 flex min-w-0 flex-col gap-0 overflow-x-hidden"
        dir="rtl"
      >
        <SheetTitle className="sr-only">
          {student ? student.full_name : t('card.studentCard')}
        </SheetTitle>

        {student && (
          <>
            {/* ── Header (stacked: avatar → details → actions, no row squeeze on narrow screens) ── */}
            <div className="shrink-0 px-6 pt-6 pb-5 sm:px-8 border-b border-border bg-muted/20">
              <div className="flex flex-col gap-4">
                <UserAvatar
                  name={student.full_name}
                  size="md"
                  className="w-14 h-14 shrink-0 text-base self-start"
                />

                <div className="min-w-0 flex flex-col gap-2">
                  <h2 className="text-lg font-bold text-foreground leading-snug break-words">
                    {student.full_name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {student.grade && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted border border-border text-muted-foreground">
                        {t('card.grade', { grade: student.grade })}
                      </span>
                    )}
                    <StatusBadge status={student.status} />
                  </div>
                  {student.phone && (
                    <a href={`tel:${student.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors w-fit max-w-full">
                      <Phone size={11} className="shrink-0" />
                      <span className="break-all">{student.phone}</span>
                    </a>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-foreground hidden lg:flex"
                      disabled
                      title={t('card.comingSoon')}
                    >
                      <FileBarChart size={14} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil size={13} />
                      {tCommon('actions.edit')}
                    </Button>
                    {variant === 'admin' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="px-2 text-muted-foreground">
                            <MoreVertical size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuSeparator />
                          {student.status !== 'inactive' ? (
                            <DropdownMenuItem onSelect={handleArchive} className="text-destructive focus:text-destructive gap-2">
                              <Archive size={13} />
                              {t('card.archiveStudent')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={handleRestore} className="text-emerald-600 gap-2">
                              <RotateCcw size={13} />
                              {t('restore')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* ── Body: edit mode scrolls whole form; view mode keeps tabs fixed and scrolls content only ── */}
            {isEditing ? (
              <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto min-h-0">
                <div className="px-6 py-5 sm:px-8">
                  <EditForm
                    key={student.id}
                    student={student}
                    teachers={teachers}
                    variant={variant}
                    currentParentId={parent?.id ?? null}
                    onDone={() => {
                      setIsEditing(false)
                      // Refresh parent data after edit (parent may have been linked)
                      setParentLoading(true)
                      fetchStudentParent(student.id).then((result) => {
                        setParent('data' in result ? result.data : null)
                        setParentLoading(false)
                      })
                    }}
                    onCancel={() => setIsEditing(false)}
                  />
                </div>
              </div>
            ) : (
              <Tabs.Root
                value={activeTab}
                onValueChange={handleTabChange}
                dir="rtl"
                className="min-w-0 flex flex-1 flex-col min-h-0 overflow-hidden"
              >
                {/* Tab bar stays outside the vertical scroll region so the scrollbar sits only under the tabs */}
                <div className="shrink-0 z-10 border-b border-border bg-background">
                  <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x scrollbar-hide">
                    <Tabs.List className="flex w-max max-w-none gap-1 px-6 pt-4 pb-0 sm:px-8">
                      {tabValues.map((value) => (
                        <Tabs.Trigger
                          key={value}
                          value={value}
                          className={cn(
                            'shrink-0 px-3.5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap -mb-px',
                            'text-muted-foreground hover:text-foreground',
                            'data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-primary/5',
                            'data-[state=inactive]:border-transparent',
                          )}
                        >
                          {t(`tabs.${value}` as 'tabs.overview')}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </div>
                </div>

                <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto min-h-0">
                  <div className="px-6 py-5 sm:px-8">
                    <Tabs.Content value="overview" forceMount className="data-[state=inactive]:hidden">
                      <OverviewTab student={student} parent={parent} parentLoading={parentLoading} />
                    </Tabs.Content>
                    <Tabs.Content value="academic" forceMount className="data-[state=inactive]:hidden">
                      <AcademicTab student={student} />
                    </Tabs.Content>
                    <Tabs.Content value="history" forceMount className="data-[state=inactive]:hidden">
                      <HistoryTab lazy={lessonsLazy} />
                    </Tabs.Content>
                    <Tabs.Content value="financial" forceMount className="data-[state=inactive]:hidden">
                      <FinancialTab
                        lazy={financialLazy}
                        subscriptionsLazy={subscriptionsLazy}
                        studentId={student.id}
                        canManage={canManage}
                        onRefreshSubscriptions={refreshSubscriptions}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="homework" forceMount className="data-[state=inactive]:hidden">
                      <HomeworkTab lazy={homeworkLazy} />
                    </Tabs.Content>
                    <Tabs.Content value="goals" forceMount className="data-[state=inactive]:hidden">
                      {goalsLazy.status === 'loading' || goalsLazy.status === 'idle' ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
                        </div>
                      ) : (
                        <>
                          {goalsLazy.status === 'error' && (
                            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-xl mb-4">
                              <AlertCircle size={15} className="shrink-0" />
                              <span className="flex-1">{goalsLazy.error}</span>
                              <button
                                type="button"
                                onClick={refreshGoals}
                                className="text-xs underline hover:no-underline shrink-0"
                              >
                                {tCommon('actions.refresh')}
                              </button>
                            </div>
                          )}
                          <GoalsSection
                            goals={goalsLazy.data ?? []}
                            studentId={student.id}
                            createAction={createGoalAction}
                            updateStatusAction={updateGoalStatusAction}
                            deleteAction={deleteGoalAction}
                            canEdit={canManage ?? false}
                            onSuccess={refreshGoals}
                          />
                        </>
                      )}
                    </Tabs.Content>
                  </div>
                </div>
              </Tabs.Root>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
