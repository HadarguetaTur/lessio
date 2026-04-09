import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getTemplates } from '@/lib/homework'
import { getStudents } from '@/lib/students'
import { AssignForm } from '@/components/dashboard/homework/AssignForm'
import { assignHomeworkAction } from './actions'
import { getTranslations } from 'next-intl/server'

/**
 * Assign homework page — assign a template or ad-hoc homework to one or more students.
 * Per /docs/sprint-14-scope.md § Story 4.
 */
export default async function AssignHomeworkPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">אין הרשאה</div>
  }

  const [templates, students] = await Promise.all([
    getTemplates(orgId),
    getStudents(orgId),
  ])

  const t = await getTranslations('homework')

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/homework"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← {t('title')}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('assign')}</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AssignForm
          templates={templates}
          students={students}
          action={assignHomeworkAction}
        />
      </div>
    </div>
  )
}
