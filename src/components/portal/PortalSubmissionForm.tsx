'use client'

import { useActionState } from 'react'
import { Upload } from 'lucide-react'
import type { SubmitActionState } from '@/app/portal/[orgId]/homework/[id]/actions'

type Props = {
  action: (prev: SubmitActionState, fd: FormData) => Promise<SubmitActionState>
  hasExisting: boolean
}

export function PortalSubmissionForm({ action, hasExisting }: Props) {
  const [state, formAction, isPending] = useActionState(action, { error: null })

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-sm text-green-700 font-semibold">ההגשה נשלחה בהצלחה!</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">
        {hasExisting ? 'עדכון הגשה' : 'הגשת שיעורי בית'}
      </p>

      <textarea
        name="note"
        rows={3}
        placeholder="הערות (אופציונלי)..."
        className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 hover:bg-accent/30 transition-colors">
        <Upload size={16} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">העלה קובץ (עד 20MB)</span>
        <input type="file" name="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
      </label>

      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'שולח...' : hasExisting ? 'עדכן הגשה' : 'הגש'}
      </button>
    </form>
  )
}
