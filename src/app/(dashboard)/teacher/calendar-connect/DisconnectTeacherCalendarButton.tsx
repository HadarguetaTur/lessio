'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { disconnectTeacherCalendar } from './actions'
import { useTranslations } from 'next-intl'

export function DisconnectTeacherCalendarButton() {
  const t = useTranslations()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => disconnectTeacherCalendar())}
    >
      {pending ? t('teacherSelf.disconnecting') : t('teacherSelf.disconnectCalendar')}
    </Button>
  )
}
