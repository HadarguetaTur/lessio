'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { requestCancelSaasAtPeriodEndAction } from './actions'

async function cancelBound(
  _prev: { error: string } | null,
  _formData: FormData
): Promise<{ error: string } | null> {
  const r = await requestCancelSaasAtPeriodEndAction()
  if (r && 'error' in r) return r
  return null
}

export function CancelSaasButton() {
  const t = useTranslations('saas.accountBilling')
  const [state, formAction, pending] = useActionState(cancelBound, null)

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? '…' : t('cancelAtEnd')}
      </Button>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  )
}
