'use client'

import { useState, useTransition } from 'react'

interface Props {
  leadId: string
  initialNotes: string | null
  action: (leadId: string, notes: string) => Promise<{ error: string | null }>
}

export function LeadNotesButton({ leadId, initialNotes, action }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    startTransition(async () => {
      const result = await action(leadId, notes)
      if (result.error) {
        setError(result.error)
        return
      }
      setError(null)
      setIsOpen(false)
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        {initialNotes ? 'ערוך הערה' : 'הוסף הערה'}
      </button>
    )
  }

  return (
    <div className="space-y-2 min-w-48">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="הערה על הליד"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="text-sm text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'שומר...' : 'שמור'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
            setNotes(initialNotes ?? '')
          }}
          disabled={isPending}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          ביטול
        </button>
      </div>
    </div>
  )
}
