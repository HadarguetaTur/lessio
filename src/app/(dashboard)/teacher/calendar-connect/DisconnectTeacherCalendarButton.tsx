'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { disconnectTeacherCalendar } from './actions'

export function DisconnectTeacherCalendarButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => disconnectTeacherCalendar())}
    >
      {pending ? 'מנתק...' : 'נתק יומן'}
    </Button>
  )
}
