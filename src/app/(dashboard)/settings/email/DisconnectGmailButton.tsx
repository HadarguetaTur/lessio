'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { disconnectGmail } from './actions'
import { useTranslations } from 'next-intl'

const initial = { error: null }

export function DisconnectGmailButton() {
  const tp = useTranslations('settings')
  const [state, formAction, pending] = useActionState(disconnectGmail, initial)

  return (
    <form action={formAction}>
      {state.error && (
        <p className="mb-2 text-sm text-red-600">{state.error}</p>
      )}
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? tp('emailActions.disconnecting') : tp('emailActions.disconnectGoogle')}
      </Button>
    </form>
  )
}
