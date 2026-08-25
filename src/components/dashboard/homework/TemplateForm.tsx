'use client'

/**
 * TemplateForm — reusable client component for creating/editing homework templates.
 * Per /docs/sprint-14-scope.md § Story 3.
 */

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ActionState } from '@/app/(dashboard)/homework/templates/actions'

interface TemplateFormProps {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  initialValues?: {
    title: string
    subject?: string
    body: string
  }
  submitLabel: string
}

const initialState: ActionState = { error: null, success: false }

export function TemplateForm({ action, initialValues, submitLabel }: TemplateFormProps) {
  const t = useTranslations('homework')
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(action, initialState)

  useEffect(() => {
    if (state.success) {
      router.push('/homework/templates')
    }
  }, [state.success, router])

  return (
    <form action={formAction} className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          {t('fields.title')} <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={initialValues?.title ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('titlePlaceholder')}
        />
      </div>

      {/* Subject (optional) */}
      <div>
        <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
          {t('fields.subject')} <span className="text-muted-foreground text-xs">{t('subjectOptional')}</span>
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          maxLength={100}
          defaultValue={initialValues?.subject ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('subjectPlaceholder')}
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
          {t('fields.body')} <span className="text-red-600">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={2000}
          defaultValue={initialValues?.body ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
          placeholder={t('bodyPlaceholder')}
        />
      </div>

      {/* Server error */}
      {state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('saving') : submitLabel}
      </button>
    </form>
  )
}
