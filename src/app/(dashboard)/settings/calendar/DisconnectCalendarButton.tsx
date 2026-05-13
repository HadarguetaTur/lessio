'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { disconnectOrgCalendar } from './actions'

export function DisconnectCalendarButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => disconnectOrgCalendar())}
    >
      {pending ? 'מנתק...' : 'נתק יומן'}
    </Button>
  )
}
