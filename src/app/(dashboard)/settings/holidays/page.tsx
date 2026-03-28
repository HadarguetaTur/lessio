import { forbidden } from 'next/navigation'
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
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    forbidden()
  }

  const holidays = await getOrgHolidays(orgId)

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">חגים וחופשות</h1>
      <p className="text-sm text-gray-500 mb-8">
        הגדר תאריכים בהם לא מתקיימות הזמנות — חגים, ימי עיון, חופשות ארגוניות.
        תאריכים אלה יחסמו אוטומטית את כל הסלוטים בדף ההזמנה.
      </p>

      {/* Holiday list */}
      {holidays.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">לא הוגדרו חגים עדיין.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  תאריך
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שם
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays.map((h) => {
                const delAction = deleteHoliday.bind(null, h.id)
                return (
                  <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900" dir="ltr">
                      {fmtDate(h.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{h.name}</td>
                    <td className="px-4 py-3 text-left">
                      <form action={delAction}>
                        <button
                          type="submit"
                          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={13} />
                          מחק
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add holiday form */}
      <AddHolidayForm />
    </div>
  )
}
