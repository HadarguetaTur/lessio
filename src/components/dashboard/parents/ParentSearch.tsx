'use client'

import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { useDebouncedSearchParam } from '@/lib/hooks/useDebouncedSearchParam'

interface ParentSearchProps {
  q: string
}

export function ParentSearch({ q }: ParentSearchProps) {
  const t = useTranslations('parents')
  const [draft, setDraft] = useDebouncedSearchParam(q, (d) => {
    const params = new URLSearchParams()
    if (d) params.set('q', d)
    const qs = params.toString()
    return qs ? `/parents?${qs}` : '/parents'
  })

  return (
    <div className="relative max-w-sm">
      <Search
        size={15}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('searchPlaceholder')}
        type="search"
        autoComplete="off"
        className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
