import { redirect } from 'next/navigation'
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

  if (role !== 'teacher') {
    redirect('/dashboard')
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return (
      <div className="text-center mt-16 text-sm text-gray-500">
        לא נמצאה רשומת מורה פעילה. פנה למנהל המערכת.
      </div>
    )
  }

  const overrides = await getTeacherOverrides(teacher.id, orgId)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">חריגים ביומן</h1>
      <p className="text-sm text-gray-500 mb-6">
        הוסף תאריכים ספציפיים שבהם אתה לא זמין, או תאריכים עם שעות מיוחדות.
      </p>

      {/* Overrides list */}
      {overrides.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">אין חריגים מוגדרים.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  תאריך
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  סוג
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שעות
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  סיבה
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overrides.map((o) => {
                const delAction = deleteTeacherOverride.bind(null, o.id)
                return (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 font-mono" dir="ltr">
                      {fmtDate(o.override_date)}
                    </td>
                    <td className="px-4 py-3">
                      {o.is_available ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                          <Clock size={11} />
                          זמינות מיוחדת
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                          <Ban size={11} />
                          חסום
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono" dir="ltr">
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

      {/* Add override form */}
      <AddOverrideForm action={addTeacherOverride} />
    </div>
  )
}
