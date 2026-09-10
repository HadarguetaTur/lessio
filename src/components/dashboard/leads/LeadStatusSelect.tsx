'use client'

import { useTransition, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LeadStatus } from '@/lib/leads'

interface Props {
  leadId: string
  currentStatus: LeadStatus
  /**
   * Names which lead this control belongs to. One select per row means the
   * accessible name has to carry the row identity — "status" alone leaves a
   * screen-reader user with four identical combo boxes.
   */
  label: string
  action: (leadId: string, status: LeadStatus) => Promise<{ error: string | null }>
}

export function LeadStatusSelect({ leadId, currentStatus, label, action }: Props) {
  const t = useTranslations('leads')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as LeadStatus
    setError(null)
    startTransition(async () => {
      const result = await action(leadId, status)
      if (result.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div>
      <select
        aria-label={label}
        value={currentStatus === 'converted' ? 'converted' : currentStatus}
        onChange={handleChange}
        disabled={isPending || currentStatus === 'converted'}
        className="border border-input rounded-md px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {currentStatus === 'converted' ? (
          <option value="converted">{t('statusConverted')}</option>
        ) : (
          ([
            ['new', t('statusNew')],
            ['contacted', t('statusContacted')],
            ['irrelevant', t('statusIrrelevant')],
          ] as [Exclude<LeadStatus, 'converted'>, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))
        )}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
