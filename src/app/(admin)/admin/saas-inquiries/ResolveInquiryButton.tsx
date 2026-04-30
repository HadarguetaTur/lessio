'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { resolveSaasPlanInquiryAction } from './actions'

export function ResolveInquiryButton({ inquiryId }: { inquiryId: string }) {
  const t = useTranslations('admin.saasInquiries')
  const [state, formAction, pending] = useActionState(resolveSaasPlanInquiryAction, null)

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <Button type="submit" size="sm" variant="default" disabled={pending}>
        {pending ? '…' : t('resolve')}
      </Button>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  )
}
