'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendTestEmail } from './actions'

const initial = { error: null }

export function SendTestEmailForm() {
  const [state, formAction, pending] = useActionState(sendTestEmail, initial)

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-gray-500 mb-1">שלחי מייל בדיקה לכתובת כלשהי</p>
      <div className="flex gap-2">
        <Input
          name="to"
          type="email"
          placeholder="example@gmail.com"
          defaultValue="yeshuat11@gmail.com"
          className="text-sm"
          required
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? 'שולח...' : 'שלח בדיקה'}
        </Button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">המייל נשלח בהצלחה!</p>}
    </form>
  )
}
