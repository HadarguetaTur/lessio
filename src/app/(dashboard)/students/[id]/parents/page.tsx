import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Star, Trash2 } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getStudentById } from '@/lib/students'
import {
  getStudentParents,
  getAvailableParentsForStudent,
} from '@/lib/relationships'
import { LinkParentForm } from '@/components/dashboard/relationships/LinkParentForm'
import { linkParent, setPrimary, unlinkParent } from './actions'

export default async function StudentParentsPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const student = await getStudentById(id, orgId)
  if (!student) notFound()

  const [linked, available] = await Promise.all([
    getStudentParents(id, orgId),
    getAvailableParentsForStudent(id, orgId),
  ])

  const boundLinkParent = linkParent.bind(null, id)

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/students" className="hover:text-gray-700">
          תלמידים
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">{student.full_name}</span>
        <ArrowRight size={14} className="rotate-180" />
        <span>הורים</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        הורים של {student.full_name}
      </h1>

      {/* Linked parents */}
      {linked.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">לא קושרו הורים לתלמיד זה עדיין.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
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
              {linked.map((rel) => {
                const setPrimaryAction = setPrimary.bind(null, rel.id, id)
                const unlinkAction = unlinkParent.bind(null, rel.id, id)
                return (
                  <tr key={rel.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {rel.parent.full_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono" dir="ltr">
                      {rel.parent.phone}
                    </td>
                    <td className="px-4 py-3">
                      {rel.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">
                          <Star size={11} />
                          עיקרי
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">משני</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {!rel.is_primary && (
                          <form action={setPrimaryAction}>
                            <button
                              type="submit"
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              הגדר עיקרי
                            </button>
                          </form>
                        )}
                        <form action={unlinkAction}>
                          <button
                            type="submit"
                            className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={13} />
                            הסר
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add parent */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">הוסף הורה</h2>
        <LinkParentForm
          action={boundLinkParent}
          availableParents={available}
          hasExistingParents={linked.length > 0}
        />
      </div>
    </div>
  )
}
