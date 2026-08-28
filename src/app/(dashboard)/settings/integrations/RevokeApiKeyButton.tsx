'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { revokeApiKeyAction, type RevokeApiKeyResult } from './actions'

const initialState: RevokeApiKeyResult = { error: null }

export function RevokeApiKeyButton({ keyId, name }: { keyId: string; name: string }) {
  const t = useTranslations('settings.integrations')
  const [state, formAction, isPending] = useActionState(revokeApiKeyAction, initialState)

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Revoking breaks whatever automation holds this key, with no undo.
        if (!window.confirm(t('revokeConfirm', { name }))) e.preventDefault()
      }}
    >
      <input type="hidden" name="keyId" value={keyId} />
      {state.error && <p className="mb-1 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? `${t('revoke')}…` : t('revoke')}
      </button>
    </form>
  )
}
