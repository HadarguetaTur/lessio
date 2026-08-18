import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTemplates } from '@/lib/homework'
import { DeleteTemplateButton } from './DeleteTemplateButton'
import { getTranslations } from 'next-intl/server'
import { commonError } from '@/lib/i18n/actionErrors'

/**
 * Homework templates list page.
 * Per /docs/sprint-14-scope.md § Story 3.
 */
export default async function HomeworkTemplatesPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">{await commonError('noPermission')}</div>
  }

  const templates = await getTemplates(orgId)
  const t = await getTranslations('homework')
  const tCommon = await getTranslations('common')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('templates')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('homework.templatesSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/homework"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← {t('title')}
          </Link>
          <Link
            href="/homework/templates/new"
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            + {t('newTemplate')}
          </Link>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm mb-3">{tCommon('emptyStates.noResults')}</p>
          <Link
            href="/homework/templates/new"
            className="text-sm text-blue-600 hover:underline"
          >
            {t('newTemplate')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 text-sm">{tmpl.title}</span>
                  {tmpl.subject && (
                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                      {tmpl.subject}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate max-w-prose">
                  {tmpl.body.slice(0, 80)}{tmpl.body.length > 80 ? '...' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/homework/templates/${tmpl.id}/edit`}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={12} />
                  {tCommon('actions.edit')}
                </Link>
                <DeleteTemplateButton templateId={tmpl.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
