'use client'

import { useTransition, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LeadStatus } from '@/lib/leads'

interface Props {
  leadId: string
  currentStatus: LeadStatus
  action: (leadId: string, status: LeadStatus) => Promise<{ error: string | null }>
}

export function LeadStatusSelect({ leadId, currentStatus, action }: Props) {
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
        value={currentStatus === 'converted' ? 'converted' : currentStatus}
        onChange={handleChange}
        disabled={isPending || currentStatus === 'converted'}
        className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
