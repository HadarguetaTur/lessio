'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { CancelLessonResult } from '@/app/portal/[orgId]/schedule/actions'

interface Props {
  lessonId: string
  studentName: string
  lessonDate: string
  cancelAction: (lessonId: string) => Promise<CancelLessonResult>
}

export function PortalCancelDialog({ lessonId, studentName, lessonDate, cancelAction }: Props) {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<CancelLessonResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAction(lessonId)
      setResult(res)
      if (res.ok) {
        // Close after showing message briefly
        setTimeout(() => setOpen(false), 2000)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setResult(null) }}
        className="text-xs text-red-600 hover:text-red-700 font-medium"
      >
        ביטול
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card rounded-xl border border-border p-5 w-full max-w-[360px] space-y-4">
        {result ? (
          <div className="text-center space-y-2">
            <p className={`text-sm font-medium ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
              {result.ok ? result.message : result.error}
            </p>
            {!result.ok && (
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                סגור
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">ביטול שיעור</h3>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              לבטל את השיעור של <span className="font-medium text-foreground">{studentName}</span> ב-{lessonDate}?
            </p>
            <p className="text-xs text-muted-foreground">
              ביטול עשוי לגרור חיוב בהתאם למדיניות הביטול.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
              >
                חזרה
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'מבטל...' : 'אישור ביטול'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
