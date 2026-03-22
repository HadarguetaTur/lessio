import Link from 'next/link'
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth/session'
import { getStudents } from '@/lib/students'
import { StudentSearch } from '@/components/dashboard/students/StudentSearch'
import { archiveStudent, restoreStudent } from './actions'

export default async function StudentsPage(props: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const searchParams = await props.searchParams
  const isActive = searchParams.status !== 'inactive'
  const q = searchParams.q ?? ''

  const { orgId } = await getSession()
  const students = await getStudents(orgId, { search: q, isActive })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">תלמידים</h1>
        <Link href="/students/new">
          <Button>
            <Plus size={16} className="ml-1" />
            תלמיד חדש
          </Button>
        </Link>
      </div>

      <StudentSearch q={q} isActive={isActive} />

      {students.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-400">לא נמצאו תלמידים</p>
      ) : (
        <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שם
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  כיתה
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map((student) => {
                const archiveAction = archiveStudent.bind(null, student.id)
                const restoreAction = restoreStudent.bind(null, student.id)
                return (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {student.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {student.grade ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/students/${student.id}/edit`}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Pencil size={13} />
                          עריכה
                        </Link>
                        {student.is_active ? (
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
