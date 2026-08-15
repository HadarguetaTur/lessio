'use client'

import { useState, useTransition } from 'react'
import { sendLessonReminderAction } from './actions'

interface Props {
  lessonId: string
}

export function SendLessonReminderButton({ lessonId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await sendLessonReminderAction(lessonId)
      if (!result.error) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  if (sent) {
    return (
      <span className="px-3 py-1.5 text-xs font-medium text-emerald-700">
        התזכורת נשלחה ✓
      </span>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
      >
        {isPending ? 'שולח...' : 'שליחת תזכורת בוואטסאפ'}
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}
