import Link from 'next/link'
import { Plus, Pencil, Archive, RotateCcw, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { archiveTeacher, restoreTeacher } from './actions'

export default async function TeachersPage() {
  const { orgId } = await getSession()
  const teachers = await getTeachers(orgId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">מורים</h1>
        <Link href="/teachers/new">
          <Button>
            <Mail size={16} className="ml-1" />
            הזמן מורה
          </Button>
        </Link>
      </div>

      {teachers.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-400 mb-3">עדיין לא הוזמנו מורים.</p>
          <Link href="/teachers/new">
            <Button variant="outline" size="sm">הזמן מורה ראשון</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שם
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  ביוגרפיה
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  סטטוס
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teachers.map((teacher) => {
                const archiveAction = archiveTeacher.bind(null, teacher.id)
                const restoreAction = restoreTeacher.bind(null, teacher.id)
                return (
                  <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {teacher.profile.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {teacher.bio ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {teacher.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                          פעיל
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                          לא פעיל
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/teachers/${teacher.id}/edit`}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Pencil size={13} />
                          עריכה
                        </Link>
                        {teacher.is_active ? (
                          <form action={archiveAction}>
                            <button
                              type="submit"
                              className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                            >
                              <Archive size={13} />
                              ארכיב
                            </button>
                          </form>
                        ) : (
                          <form action={restoreAction}>
                            <button
                              type="submit"
                              className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                            >
                              <RotateCcw size={13} />
                              שחזור
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
