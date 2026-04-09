import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Star } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getParentById } from '@/lib/parents'
import { getParentStudents } from '@/lib/relationships'
import { getParentDebt } from '@/lib/charges'
import { ParentForm } from '@/components/dashboard/parents/ParentForm'
import { updateParent } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditParentPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const [parent, linkedStudents, debt] = await Promise.all([
    getParentById(id, orgId),
    getParentStudents(id, orgId),
    getParentDebt(id, orgId),
  ])

  if (!parent) notFound()

  const t = await getTranslations('parents')
  const tStudents = await getTranslations('students')
  const boundUpdateParent = updateParent.bind(null, parent.id)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('editParent')}</h1>

      <ParentForm
        action={boundUpdateParent}
        defaultValues={{
          full_name: parent.full_name,
          phone: parent.phone,
          notes: parent.notes,
        }}
      />

      {/* Debt summary */}
      <div className="mt-6 bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{t('balance')}</span>
        <span className={`text-base font-bold ${debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>
          {debt > 0 ? `₪${debt.toFixed(2)}` : 'אין חוב'}
        </span>
      </div>
      {debt > 0 && (
        <div className="mt-2 text-left">
          <Link href={`/charges?parent=${id}`} className="text-sm text-blue-600 hover:text-blue-800">
            צפה בחיובים ←
          </Link>
        </div>
      )}

      {/* Linked students — read-only view */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-800 mb-3">{tStudents('parents.title')}</h2>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-gray-400">{tStudents('parents.noParents')}</p>
        ) : (
          <ul className="space-y-2">
            {linkedStudents.map((rel) => (
              <li
                key={rel.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-md px-4 py-2.5"
              >
                <Link
                  href={`/students/${rel.student.id}/parents`}
                  className="text-sm font-medium text-gray-900 hover:text-blue-600"
                >
                  {rel.student.full_name}
                </Link>
                {rel.student.grade && (
                  <span className="text-xs text-gray-400">{rel.student.grade}</span>
                )}
                {rel.is_primary && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 mr-auto">
                    <Star size={11} />
                    עיקרי
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
