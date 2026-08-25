'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil, CalendarDays } from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import { TeacherEditForm } from './TeacherEditForm'
import { cn } from '@/lib/utils'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type VoidAction = () => Promise<void>

export interface TeacherDetailPanelProps {
  teacher: {
    id: string
    bio: string | null
    hourly_rate: number | null
    is_active: boolean
    profile: { full_name: string; phone: string | null }
  }
  updateAction: FormAction
  archiveAction: VoidAction
  restoreAction: VoidAction
  canMutate: boolean
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
    </div>
  )
}

export function TeacherDetailPanel({
  teacher,
  updateAction,
  archiveAction,
  restoreAction,
  canMutate,
}: TeacherDetailPanelProps) {
  const [editing, setEditing] = useState(false)
  const router = useRouter()
  const t = useTranslations('teachers')
  const tStudents = useTranslations('students')
  const tCommon = useTranslations('common')

  const handleSaved = () => {
    setEditing(false)
    router.refresh()
  }

  const rateDisplay =
    teacher.hourly_rate != null && !Number.isNaN(Number(teacher.hourly_rate))
      ? `₪${Number(teacher.hourly_rate).toFixed(2)}`
      : null

  return (
    <div className="space-y-6 min-w-0">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 min-w-0">
            <UserAvatar name={teacher.profile.full_name} size="md" className="w-14 h-14 shrink-0 text-base" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h1 className="text-xl font-bold text-foreground leading-snug break-words">{teacher.profile.full_name}</h1>
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0',
                    teacher.is_active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-muted text-muted-foreground border-border',
                  )}
                >
                  {teacher.is_active ? tStudents('status.active') : tStudents('status.inactive')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground" dir="ltr">
                {rateDisplay ? (
                  <span className="font-medium tabular-nums text-foreground">{rateDisplay}</span>
                ) : (
                  <span className="text-amber-600">{t('noRateWarning')}</span>
                )}
              </p>
            </div>
          </div>

          {canMutate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setEditing((v) => !v)}
              >
                <Pencil size={13} />
                {editing ? tCommon('actions.cancel') : t('edit')}
              </Button>
              {teacher.is_active ? (
                <form action={archiveAction}>
                  <Button variant="outline" size="sm" type="submit" className="text-destructive border-destructive/30 hover:bg-destructive/5">
                    {t('archive')}
                  </Button>
                </form>
              ) : (
                <form action={restoreAction}>
                  <Button variant="outline" size="sm" type="submit" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                    {t('restore')}
                  </Button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <SectionHeader title={tStudents('tabs.overview')} />
        <dl className="divide-y divide-border/60">
          <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <dt className="text-sm text-muted-foreground shrink-0">{t('fields.hourlyRate')}</dt>
            <dd className="text-sm font-medium text-foreground text-end break-words min-w-0 sm:max-w-[70%]" dir="ltr">
              {rateDisplay ?? <span className="text-amber-600 font-normal">{t('noRateWarning')}</span>}
            </dd>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <dt className="text-sm text-muted-foreground shrink-0">{t('fields.phone')}</dt>
            <dd className="text-sm font-medium text-foreground text-end break-words min-w-0 sm:max-w-[70%]" dir="ltr">
              {teacher.profile.phone ?? <span className="text-muted-foreground font-normal">—</span>}
            </dd>
          </div>
          <div className="px-4 py-4 min-h-[4.5rem]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('bio')}</p>
            {teacher.bio?.trim() ? (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">{teacher.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2" aria-hidden>
                —
              </p>
            )}
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <SectionHeader title={t('availability')} />
        <div className="p-0">
          <ul className="divide-y divide-border/60">
            <li className="px-4 py-3 hover:bg-muted/30 transition-colors">
              <Link
                href={`/teachers/${teacher.id}/availability`}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary min-w-0"
              >
                <CalendarDays size={15} className="shrink-0 opacity-70" aria-hidden />
                <span className="break-words">{t('availabilityLink')}</span>
              </Link>
            </li>
            <li className="px-4 py-3 hover:bg-muted/30 transition-colors">
              <Link
                href={`/teachers/${teacher.id}/overrides`}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary min-w-0"
              >
                <CalendarDays size={15} className="shrink-0 opacity-70" aria-hidden />
                <span className="break-words">{t('overridesLink')}</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {canMutate && editing ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <SectionHeader title={t('editTeacher')} />
          <div className="p-4 sm:p-5">
            <TeacherEditForm
              action={updateAction}
              defaultValues={{
                bio: teacher.bio,
                hourly_rate: teacher.hourly_rate,
                phone: teacher.profile.phone,
              }}
              onSuccess={handleSaved}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
