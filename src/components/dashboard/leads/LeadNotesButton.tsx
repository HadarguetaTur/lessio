'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  leadId: string
  initialNotes: string | null
  action: (leadId: string, notes: string) => Promise<{ error: string | null }>
}

export function LeadNotesButton({ leadId, initialNotes, action }: Props) {
  const t = useTranslations('leads')
  const tCommon = useTranslations('common')
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
        {initialNotes ? t('editNote') : t('addNote')}
      </button>
    )
  }

  return (
    <div className="space-y-2 min-w-48">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t('notePlaceholder')}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="text-sm text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? t('saving') : tCommon('actions.save')}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
            setNotes(initialNotes ?? '')
          }}
          disabled={isPending}
          className="text-sm text-muted-foreground hover:text-gray-700 disabled:opacity-40"
        >
          {tCommon('actions.cancel')}
        </button>
      </div>
    </div>
  )
}
