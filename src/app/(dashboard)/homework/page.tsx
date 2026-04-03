import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getAssignments } from '@/lib/homework'

/**
 * Homework list page — shows all assignments for the org.
 * Per /docs/sprint-14-scope.md § Story 5.
 */

type Status = 'pending' | 'done' | 'overdue'

const STATUS_LABELS: Record<Status, string> = {
  pending: 'ממתין',
  done:    'הושלם',
  overdue: 'באיחור',
}

const STATUS_CLASSES: Record<Status, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  done:    'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
}

const FILTERS: Array<{ label: string; value: Status | undefined }> = [
  { label: 'הכל',     value: undefined },
  { label: 'ממתין',   value: 'pending' },
  { label: 'הושלם',   value: 'done' },
  { label: 'באיחור',  value: 'overdue' },
]

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">אין הרשאה</div>
  }

  const { status: rawStatus } = await searchParams
  const statusFilter = (['pending', 'done', 'overdue'] as string[]).includes(rawStatus ?? '')
    ? (rawStatus as Status)
    : undefined

  const assignments = await getAssignments(orgId, { status: statusFilter })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">שיעורי בית</h1>
          <p className="text-sm text-gray-500 mt-1">מעקב אחר שיעורי בית שהוקצו לתלמידים</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/homework/templates"
            className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            תבניות
          </Link>
          <Link
            href="/homework/assign"
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            + הקצה שיעורי בית
          </Link>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-5">
        {FILTERS.map(({ label, value }) => {
          const active = statusFilter === value
          return (
            <Link
              key={label}
              href={value ? `/homework?status=${value}` : '/homework'}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm mb-3">אין שיעורי בית.</p>
          <Link href="/homework/assign" className="text-sm text-blue-600 hover:underline">
            הקצה שיעורי בית ראשונים
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תלמיד</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">כותרת</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך הגשה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">נשלח</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">הושלם</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{a.studentName}</td>
                  <td className="px-4 py-3 text-gray-900 max-w-xs truncate">{a.title}</td>
                  <td className="px-4 py-3 text-gray-500">{a.dueDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {a.sentAt
                      ? new Date(a.sentAt).toLocaleDateString('he-IL')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {a.completedAt
                      ? new Date(a.completedAt).toLocaleDateString('he-IL')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
