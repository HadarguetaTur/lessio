import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Trash2, Ban, Clock } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getTeacherOverrides } from '@/lib/availability-overrides'
import { AddOverrideForm } from '@/components/dashboard/availability/AddOverrideForm'
import { addTeacherOverride, deleteTeacherOverride } from './actions'

function fmt(t: string) {
  return t.substring(0, 5)
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default async function TeacherOverridesPage() {
  const { userId, orgId, role } = await getSession()
  const t = await getTranslations('teacherSelf.overrides')
  const tSelf = await getTranslations('teacherSelf')
  const tCommon = await getTranslations('common')

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-muted-foreground">
        {tSelf('noTeacherRecordContact')}
      </div>
    )
  }

  const overrides = await getTeacherOverrides(teacher.id, orgId)

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{tSelf('overridesHint')}</p>

      {/* Overrides list */}
      {overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">{tCommon('emptyStates.noResults')}</p>
      ) : (
        <div className="mb-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSelf('overridesTable.date')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSelf('overridesTable.type')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSelf('overridesTable.hours')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tSelf('overridesTable.reason')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overrides.map((o) => {
                  const delAction = deleteTeacherOverride.bind(null, o.id)
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900" dir="ltr">
                        {fmtDate(o.override_date)}
                      </td>
                      <td className="px-4 py-3">
                        {o.is_available ? (
                          <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            <Clock size={11} />
                            {t('typeAvailable')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            <Ban size={11} />
                            {t('typeBlocked')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-muted-foreground" dir="ltr">
                        {o.is_available && o.start_time && o.end_time
                          ? `${fmt(o.start_time)}–${fmt(o.end_time)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {o.reason ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <form action={delAction}>
                          <button
                            type="submit"
                            className="flex items-center gap-1 text-sm text-red-600 transition-colors hover:text-red-700"
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
      <AddOverrideForm action={addTeacherOverride} />
    </div>
  )
}
