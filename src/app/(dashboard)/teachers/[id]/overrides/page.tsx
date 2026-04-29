import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Trash2, Ban, Clock } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { getTeacherOverrides } from '@/lib/availability-overrides'
import { AddOverrideForm } from '@/components/dashboard/availability/AddOverrideForm'
import { createOverride, deleteOverride } from './actions'
import { getTranslations } from 'next-intl/server'

function fmt(t: string) {
  return t.substring(0, 5)
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default async function TeacherOverridesPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const overrides = await getTeacherOverrides(id, orgId)
  const t = await getTranslations('teachers')
  const tCommon = await getTranslations('common')
  const tSelf = await getTranslations('teacherSelf')
  const boundCreate = createOverride.bind(null, id)

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden pb-8 min-w-0">
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
        <span className="text-foreground font-medium">{t('overrides')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-foreground mb-6 break-words">
        {t('overrides')} — {teacher.profile.full_name}
      </h1>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <Link
          href={`/teachers/${id}/availability`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('availability')}
        </Link>
        <span className="text-border" aria-hidden>
          |
        </span>
        <span className="font-medium text-foreground">{t('overrides')}</span>
      </div>

      {overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">{tCommon('emptyStates.noResults')}</p>
      ) : (
        <div className="mb-6 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky top-0 z-10 bg-muted/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.date')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tSelf('overrides.type')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.time')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tSelf('overrides.reason')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-4 py-3 w-12 backdrop-blur" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {overrides.map((o) => {
                  const delAction = deleteOverride.bind(null, o.id, id)
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-foreground" dir="ltr">
                        {fmtDate(o.override_date)}
                      </td>
                      <td className="px-4 py-3">
                        {o.is_available ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                            <Clock size={11} aria-hidden />
                            {tSelf('overrides.specialAvailability')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive border border-destructive/20">
                            <Ban size={11} aria-hidden />
                            {tSelf('overrides.typeBlocked')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-muted-foreground tabular-nums" dir="ltr">
                        {o.is_available && o.start_time && o.end_time ? `${fmt(o.start_time)}–${fmt(o.end_time)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground break-words max-w-[12rem] sm:max-w-xs">
                        {o.reason ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <form action={delAction}>
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 text-sm font-medium text-destructive hover:text-destructive/90 hover:underline"
                          >
                            <Trash2 size={13} className="shrink-0" aria-hidden />
                            {tCommon('actions.delete')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddOverrideForm action={boundCreate} />
    </div>
  )
}
