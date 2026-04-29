'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { CalendarDays, Pencil } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import { TeacherEditForm } from './TeacherEditForm'
import { cn } from '@/lib/utils'
import {
  fetchTeacherForSheet,
  updateTeacher,
  archiveTeacher,
  restoreTeacher,
  type Teacher,
} from '@/app/(dashboard)/teachers/actions'

interface TeacherDetailSheetProps {
  teacherId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  role: 'owner' | 'admin' | 'teacher'
  /** Optimistic name shown while loading */
  initialName?: string
}

type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: Teacher }
  | { status: 'error'; message: string }

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground shrink-0 min-w-[90px]">{label}</dt>
      <dd className="text-right font-medium break-words min-w-0">{children}</dd>
    </div>
  )
}

export function TeacherDetailSheet({
  teacherId,
  open,
  onOpenChange,
  role,
  initialName,
}: TeacherDetailSheetProps) {
  const t = useTranslations('teachers')
  const tStudents = useTranslations('students')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [state, setState] = useState<SheetState>({ status: 'idle' })
  const [editing, setEditing] = useState(false)

  const canMutate = role === 'owner' || role === 'admin'

  useEffect(() => {
    if (!open || !teacherId) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' })
    setEditing(false)

    let cancelled = false
    fetchTeacherForSheet(teacherId).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setState({ status: 'error', message: result.error })
      } else {
        setState({ status: 'loaded', data: result.data })
      }
    })

    return () => {
      cancelled = true
    }
  }, [open, teacherId])

  const updateAction = useMemo(
    () => (teacherId ? updateTeacher.bind(null, teacherId) : null),
    [teacherId]
  )
  const archiveAction = useMemo(
    () => (teacherId ? archiveTeacher.bind(null, teacherId) : null),
    [teacherId]
  )
  const restoreAction = useMemo(
    () => (teacherId ? restoreTeacher.bind(null, teacherId) : null),
    [teacherId]
  )

  function handleSaved() {
    setEditing(false)
    if (teacherId) {
      fetchTeacherForSheet(teacherId).then((result) => {
        if ('data' in result) setState({ status: 'loaded', data: result.data })
      })
    }
    router.refresh()
  }

  const displayName =
    state.status === 'loaded' ? state.data.profile.full_name : (initialName ?? '…')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[520px] p-0 flex flex-col min-w-0 gap-0 overflow-hidden"
        dir="rtl"
      >
        <SheetTitle className="sr-only">{displayName}</SheetTitle>

        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-muted/20 flex items-start gap-3 min-w-0">
          <UserAvatar name={displayName} size="md" className="w-12 h-12 shrink-0 text-base mt-0.5" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-bold text-foreground leading-snug break-words">{displayName}</h2>
            {state.status === 'loaded' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0',
                      state.data.is_active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-muted text-muted-foreground border-border',
                    )}
                  >
                    {state.data.is_active ? tStudents('status.active') : tStudents('status.inactive')}
                  </span>
                  {state.data.hourly_rate != null ? (
                    <span className="text-sm text-muted-foreground tabular-nums font-mono" dir="ltr">
                      ₪{Number(state.data.hourly_rate).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">{t('noRateWarning')}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {state.status === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          )}

          {state.status === 'error' && (
            <p className="text-sm text-destructive text-center py-8">{state.message}</p>
          )}

          {state.status === 'loaded' && (() => {
            const teacher = state.data
            return (
              <>
                {/* Overview */}
                <SectionCard title={tStudents('tabs.overview')}>
                  <dl className="divide-y divide-border/60">
                    <DataRow label={t('fields.hourlyRate')}>
                      {teacher.hourly_rate != null ? (
                        <span className="font-mono tabular-nums" dir="ltr">
                          ₪{Number(teacher.hourly_rate).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-normal text-xs">
                          {t('noRateWarning')}
                        </span>
                      )}
                    </DataRow>
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                        {t('bio')}
                      </p>
                      {teacher.bio?.trim() ? (
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">
                          {teacher.bio}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-1">—</p>
                      )}
                    </div>
                  </dl>
                </SectionCard>

                {/* Availability links */}
                <SectionCard title={t('availability')}>
                  <ul className="divide-y divide-border/60">
                    <li className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <Link
                        href={`/teachers/${teacher.id}/availability`}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                      >
                        <CalendarDays size={14} className="shrink-0 opacity-70" aria-hidden />
                        {t('availabilityLink')}
                      </Link>
                    </li>
                    <li className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <Link
                        href={`/teachers/${teacher.id}/overrides`}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                      >
                        <CalendarDays size={14} className="shrink-0 opacity-70" aria-hidden />
                        {t('overridesLink')}
                      </Link>
                    </li>
                  </ul>
                </SectionCard>

                {/* Actions */}
                {canMutate && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing((v) => !v)}
                      className="gap-1.5"
                    >
                      <Pencil size={13} />
                      {editing ? tCommon('actions.cancel') : t('edit')}
                    </Button>
                    {teacher.is_active && archiveAction ? (
                      <form action={archiveAction} onSubmit={() => onOpenChange(false)}>
                        <Button
                          variant="outline"
                          size="sm"
                          type="submit"
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        >
                          {t('archive')}
                        </Button>
                      </form>
                    ) : !teacher.is_active && restoreAction ? (
                      <form action={restoreAction} onSubmit={() => onOpenChange(false)}>
                        <Button
                          variant="outline"
                          size="sm"
                          type="submit"
                          className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        >
                          {t('restore')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                )}

                {/* Edit form */}
                {canMutate && editing && updateAction && (
                  <SectionCard title={t('editTeacher')}>
                    <div className="p-4">
                      <TeacherEditForm
                        action={updateAction}
                        defaultValues={{
                          bio: teacher.bio,
                          hourly_rate: teacher.hourly_rate,
                        }}
                        onSuccess={handleSaved}
                        onCancel={() => setEditing(false)}
                      />
                    </div>
                  </SectionCard>
                )}
              </>
            )
          })()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
