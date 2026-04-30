import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTemplate } from '@/lib/homework'
import { TemplateForm } from '@/components/dashboard/homework/TemplateForm'
import { updateTemplateAction } from '../../actions'
import { getTranslations } from 'next-intl/server'

/**
 * Edit homework template page.
 * Per /docs/sprint-14-scope.md § Story 3.
 */
export default async function EditTemplatePage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">אין הרשאה</div>
  }

  const template = await getTemplate(orgId, id)
  if (!template) notFound()

  const boundAction = updateTemplateAction.bind(null, id)

  const t = await getTranslations('homework')
  const tCommon = await getTranslations('common')

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('editTemplate')}</h1>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <TemplateForm
          action={boundAction}
          initialValues={{
            title:   template.title,
            subject: template.subject ?? undefined,
            body:    template.body,
          }}
          submitLabel={tCommon('actions.save')}
        />
      </div>
    </div>
  )
}
