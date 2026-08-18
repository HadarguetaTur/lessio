'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { disconnectOrgCalendar } from './actions'
import { useTranslations } from 'next-intl'

export function DisconnectCalendarButton() {
  const tp = useTranslations('settings')
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => disconnectOrgCalendar())}
    >
      {pending ? tp('disconnectCalendar.disconnecting') : tp('disconnectCalendar.label')}
    </Button>
  )
}
