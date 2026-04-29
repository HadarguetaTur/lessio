import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Trash2 } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { getTeacherAvailability, DAY_NAMES, AvailabilityWindow } from '@/lib/availability'
import { AddAvailabilityForm } from '@/components/dashboard/availability/AddAvailabilityForm'
import { createAvailability, deleteAvailability } from './actions'
import { getTranslations } from 'next-intl/server'

/** Format Postgres time "HH:MM:SS" to "HH:MM" for display */
function fmt(t: string) {
  return t.substring(0, 5)
}

export default async function TeacherAvailabilityPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const windows = await getTeacherAvailability(id, orgId)

  // Group by day_of_week
  const byDay = new Map<number, AvailabilityWindow[]>()
  for (let d = 0; d <= 6; d++) byDay.set(d, [])
  windows.forEach((w) => byDay.get(w.day_of_week)!.push(w))

  const t = await getTranslations('teachers')
  const tCommon = await getTranslations('common')
  const boundCreate = createAvailability.bind(null, id)

  return (
    <div className="max-w-2xl pb-8 min-w-0">
      <nav
        className="flex flex-wrap items-center gap-2 mb-6 text-sm text-muted-foreground min-w-0"
        aria-label="Breadcrumb"
      >
        <Link href="/teachers" className="hover:text-foreground shrink-0">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <Link
          href={`/teachers/${id}/edit`}
          className="hover:text-foreground font-medium text-foreground truncate max-w-[min(100%,12rem)] sm:max-w-none"
        >
          {teacher.profile.full_name}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <span className="text-foreground font-medium">{t('availability')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-foreground mb-6 break-words">
        {t('availability')} — {teacher.profile.full_name}
      </h1>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <span className="font-medium text-foreground">{t('availability')}</span>
        <span className="text-border" aria-hidden>
          |
        </span>
        <Link
          href={`/teachers/${id}/overrides`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('overrides')}
        </Link>
      </div>

      <div className="space-y-2 mb-6">
        {Array.from(byDay.entries()).map(([day, dayWindows]) => (
          <div
            key={day}
            className="flex items-start gap-4 rounded-xl border border-border bg-card shadow-sm px-4 py-3"
          >
            <span className="w-16 shrink-0 text-sm font-medium text-foreground pt-0.5">{DAY_NAMES[day]}</span>

            {dayWindows.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              <div className="flex flex-wrap gap-2 min-w-0">
                {dayWindows.map((w) => {
                  const deleteAction = deleteAvailability.bind(null, w.id, id)
                  return (
                    <div
                      key={w.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 text-sm text-foreground px-3 py-1"
                    >
                      <span dir="ltr" className="font-mono text-xs tabular-nums">
                        {fmt(w.start_time)}–{fmt(w.end_time)}
                      </span>
                      <form action={deleteAction} className="flex">
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title={tCommon('actions.delete')}
                          aria-label={tCommon('actions.delete')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <AddAvailabilityForm action={boundCreate} />
    </div>
  )
}
