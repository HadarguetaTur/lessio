'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface PeriodSelectorProps {
  current: number
  options?: number[]
}

/**
 * Dropdown that writes a `months` query-param, triggering a server-side re-fetch.
 */
export function PeriodSelector({
  current,
  options = [3, 6, 12],
}: PeriodSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleChange = useCallback(
    (months: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('months', months)
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const labels: Record<number, string> = {
    1: 'חודש',
    3: '3 חודשים',
    6: '6 חודשים',
    12: '12 חודשים',
  }

  return (
    <select
      value={current}
      onChange={e => handleChange(e.target.value)}
      className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 text-gray-600 hover:border-gray-300 transition-colors bg-white"
      aria-label="בחר תקופה"
    >
      {options.map(m => (
        <option key={m} value={m}>
          {labels[m] ?? `${m} חודשים`}
        </option>
      ))}
    </select>
  )
}
