'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  chargeId: string
  action: (chargeId: string, notes?: string) => Promise<{ error: string | null }>
}

export function MarkAsPaidButton({ chargeId, action }: Props) {
  const t = useTranslations('charges')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    startTransition(async () => {
      const result = await action(chargeId, notes)
      if (result.error) {
        setError(result.error)
        return
      }

      setError(null)
      setNotes('')
      setIsOpen(false)
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-green-700 hover:text-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t('markAsPaidButton')}
      </button>
    )
  }

  return (
    <div className="space-y-2 min-w-56">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t('markAsPaidPlaceholder')}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
      />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="text-sm text-green-700 hover:text-green-900 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? t('updating') : tCommon('actions.confirm')}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setError(null)
            setNotes('')
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
