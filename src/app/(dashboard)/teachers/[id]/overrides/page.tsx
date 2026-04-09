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
  // d = "YYYY-MM-DD"
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
  const boundCreate = createOverride.bind(null, id)

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/teachers" className="hover:text-gray-700">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">{teacher.profile.full_name}</span>
        <ArrowRight size={14} className="rotate-180" />
        <span>{t('overrides')}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('overrides')} — {teacher.profile.full_name}
      </h1>

      {/* Nav between availability and overrides */}
      <div className="flex gap-3 mb-6 text-sm">
        <Link
          href={`/teachers/${id}/availability`}
          className="text-gray-500 hover:text-gray-800"
        >
          {t('availability')}
        </Link>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-900">{t('overrides')}</span>
      </div>

      {/* Overrides list */}
      {overrides.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">אין חריגים מוגדרים.</p>
      ) : (
        <div className="mb-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  {tCommon('table.date')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  סוג
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  שעות
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  סיבה
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overrides.map((o) => {
                  const delAction = deleteOverride.bind(null, o.id, id)
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900" dir="ltr">
                        {fmtDate(o.override_date)}
                      </td>
                      <td className="px-4 py-3">
                        {o.is_available ? (
                          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            <Clock size={11} />
                            זמינות מיוחדת
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                            <Ban size={11} />
                            {tCommon('status.cancelled')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-500" dir="ltr">
                        {o.is_available && o.start_time && o.end_time
                          ? `${fmt(o.start_time)}–${fmt(o.end_time)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {o.reason ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <form action={delAction}>
                          <button
                            type="submit"
                            className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={13} />
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

      {/* Add override form */}
      <AddOverrideForm action={boundCreate} />
    </div>
  )
}
