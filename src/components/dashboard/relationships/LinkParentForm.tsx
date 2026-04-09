'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface AvailableParent {
  id: string
  full_name: string
  phone: string
}

interface LinkParentFormProps {
  action: FormAction
  availableParents: AvailableParent[]
  hasExistingParents: boolean
}

export function LinkParentForm({
  action,
  availableParents,
  hasExistingParents,
}: LinkParentFormProps) {
  const t = useTranslations('students')
  const [state, formAction, pending] = useActionState(action, null)

  if (availableParents.length === 0) {
    return (
      <p className="text-sm text-gray-400 mt-2">
        {t('parents.allLinked')}
      </p>
    )
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 mt-3">
      {state?.error && (
        <div className="w-full text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded-md">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="parent_id" className="block text-sm font-medium text-gray-700">
          {t('parents.selectParent')}
        </label>
        <select
          id="parent_id"
          name="parent_id"
          required
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-48"
        >
          <option value="">{t('parents.selectParentOption')}</option>
          {availableParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} ({p.phone})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pb-2">
        <input
          id="is_primary"
          name="is_primary"
          type="checkbox"
          defaultChecked={!hasExistingParents}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="is_primary" className="text-sm font-medium text-gray-700">
          {t('parents.primaryBilling')}
        </label>
      </div>

      <Button type="submit" disabled={pending} className="mb-0">
        {pending ? t('parents.linking') : t('parents.linkButton')}
      </Button>
    </form>
  )
}
