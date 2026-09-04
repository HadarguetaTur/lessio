'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendTestEmail } from './actions'
import { useTranslations } from 'next-intl'

const initial = { error: null }

export function SendTestEmailForm() {
  const tp = useTranslations('settings')
  const [state, formAction, pending] = useActionState(sendTestEmail, initial)

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-muted-foreground mb-1">{tp('emailActions.testFormHint')}</p>
      <div className="flex gap-2">
        <Input
          name="to"
          type="email"
          placeholder="example@gmail.com"
          className="text-sm"
          required
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? tp('emailActions.testFormSending') : tp('emailActions.testFormSend')}
        </Button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{tp('emailActions.testFormSuccess')}</p>}
    </form>
  )
}
