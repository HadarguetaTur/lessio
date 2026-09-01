import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { getTeacherAvailability, normalizeTime } from '@/lib/availability'
import { WeeklyAvailabilityEditor } from '@/components/dashboard/availability/WeeklyAvailabilityEditor'
import { createAvailability, deleteAvailability, updateAvailability } from './actions'
import { getTranslations } from 'next-intl/server'

export default async function TeacherAvailabilityPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, isSupportMode } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const windows = await getTeacherAvailability(id, orgId)

  const t = await getTranslations('teachers')

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

      <WeeklyAvailabilityEditor
        windows={windows.map((w) => ({
          id: w.id,
          day_of_week: w.day_of_week,
          start_time: normalizeTime(w.start_time),
          end_time: normalizeTime(w.end_time),
        }))}
        addAction={createAvailability.bind(null, id)}
        updateAction={updateAvailability.bind(null, id)}
        deleteAction={deleteAvailability.bind(null, id)}
        readOnly={isSupportMode}
      />
    </div>
  )
}
