import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Trash2 } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getOrgHolidays } from '@/lib/organizations/holidays'
import { AddHolidayForm } from './AddHolidayForm'
import { deleteHoliday } from './actions'

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default async function HolidaysPage() {
  const tp = await getTranslations('settings')
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.holidays')
  const tCommon = await getTranslations('common')

  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }

  const holidays = await getOrgHolidays(orgId)

  return (
    <div className="flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{tp('holidaysPage.subtitle')}</p>

      {/* Holiday list */}
      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">{t('noHolidays')}</p>
      ) : (
        <div className="mb-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('fields.date')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('fields.name')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays.map((h) => {
                  const delAction = deleteHoliday.bind(null, h.id)
                  return (
                    <tr key={h.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm text-gray-900" dir="ltr">
                        {fmtDate(h.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.name}</td>
                      <td className="px-4 py-3 text-left">
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

      {/* Add holiday form */}
      <AddHolidayForm />
    </div>
  )
}
