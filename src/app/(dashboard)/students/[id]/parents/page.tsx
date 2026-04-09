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
import { getTranslations } from 'next-intl/server'

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

  const t = await getTranslations('students')
  const tCommon = await getTranslations('common')
  const boundLinkParent = linkParent.bind(null, id)

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <Link href="/students" className="hover:text-gray-700">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="rotate-180" />
        <span className="text-gray-900 font-medium">{student.full_name}</span>
        <ArrowRight size={14} className="rotate-180" />
        <span>{t('parents.title')}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('parents.title')} — {student.full_name}
      </h1>

      {/* Linked parents */}
      {linked.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">{t('parents.noParents')}</p>
      ) : (
        <div className="mb-6 min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  {tCommon('table.name')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  {tCommon('table.phone')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  {tCommon('table.status')}
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                  {tCommon('table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linked.map((rel) => {
                  const setPrimaryAction = setPrimary.bind(null, rel.id, id)
                  const unlinkAction = unlinkParent.bind(null, rel.id, id)
                  return (
                    <tr key={rel.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {rel.parent.full_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-500" dir="ltr">
                        {rel.parent.phone}
                      </td>
                      <td className="px-4 py-3">
                        {rel.is_primary ? (
                          <span className="inline-flex items-center gap-1 rounded bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                            <Star size={11} />
                            {t('parents.isPrimary')}
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
                                {t('parents.isPrimary')}
                              </button>
                            </form>
                          )}
                          <form action={unlinkAction}>
                            <button
                              type="submit"
                              className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={13} />
                              {t('parents.unlink')}
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
        </div>
      )}

      {/* Add parent */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">{t('parents.link')}</h2>
        <LinkParentForm
          action={boundLinkParent}
          availableParents={available}
          hasExistingParents={linked.length > 0}
        />
      </div>
    </div>
  )
}
