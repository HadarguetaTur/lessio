import { getSession } from '@/lib/auth/session'
import { TemplateForm } from '@/components/dashboard/homework/TemplateForm'
import { createTemplateAction } from '../actions'

/**
 * New homework template page.
 * Per /docs/sprint-14-scope.md § Story 3.
 */
export default async function NewTemplatePage() {
  const { role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">אין הרשאה</div>
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">תבנית חדשה</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <TemplateForm action={createTemplateAction} submitLabel="צור תבנית" />
      </div>
    </div>
  )
}
