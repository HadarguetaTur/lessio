'use client'

import type { ConfirmBookingResult } from '@/lib/booking'

interface BookingSuccessProps {
  result: ConfirmBookingResult
  teacherName: string
}

export function BookingSuccess({ result, teacherName }: BookingSuccessProps) {
  const startTime = new Date(result.startAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

  const displayDate = new Date(result.startAt).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl" aria-hidden="true">✅</div>
        <h1 className="text-xl font-semibold">השיעור נקבע!</h1>
        <p className="text-muted-foreground text-sm">
          {teacherName} · {displayDate} · {startTime}
        </p>
        <p className="text-sm">
          תקבל/י אישור ב-WhatsApp בקרוב.
        </p>
      </div>
    </main>
  )
}
