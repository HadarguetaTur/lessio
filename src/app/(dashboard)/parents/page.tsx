import Link from 'next/link'
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSession } from '@/lib/auth/session'
import { getParents } from '@/lib/parents'
import { ParentSearch } from '@/components/dashboard/parents/ParentSearch'
import { SendPaymentRequestButton } from '@/components/dashboard/parents/SendPaymentRequestButton'
import { archiveParent, restoreParent, sendPaymentRequestAction } from './actions'

export default async function ParentsPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const searchParams = await props.searchParams
  const q = searchParams.q ?? ''

  const { orgId, role } = await getSession()
  // Parents list shows all (active + inactive) — no archive tab needed per sprint scope.
  // Search covers name and phone.
  const parents = await getParents(orgId, { search: q })
  const canSendPaymentRequest = role === 'owner' || role === 'admin'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">הורים</h1>
        <Link href="/parents/new">
          <Button>
            <Plus size={16} className="ml-1" />
            הורה חדש
          </Button>
        </Link>
      </div>

      <ParentSearch q={q} />

      {parents.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-400">לא נמצאו הורים</p>
      ) : (
        <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  שם
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                  טלפון
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
              {parents.map((parent) => {
                const archiveAction = archiveParent.bind(null, parent.id)
                const restoreAction = restoreParent.bind(null, parent.id)
                return (
                  <tr key={parent.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {parent.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono" dir="ltr">
                      {parent.phone}
                    </td>
                    <td className="px-4 py-3">
                      {parent.is_active ? (
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
                          href={`/parents/${parent.id}/edit`}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <Pencil size={13} />
                          עריכה
                        </Link>
                        {canSendPaymentRequest && parent.is_active && (
                          <SendPaymentRequestButton
                            parentId={parent.id}
                            action={sendPaymentRequestAction}
                          />
                        )}
                        {parent.is_active ? (
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
