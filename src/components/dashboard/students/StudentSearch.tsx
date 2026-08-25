'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDebouncedSearchParam } from '@/lib/hooks/useDebouncedSearchParam'

interface StudentSearchProps {
  q: string
  isActive: boolean
}

function studentsFilterHref(qLocal: string, active: boolean) {
  const params = new URLSearchParams()
  if (qLocal) params.set('q', qLocal)
  if (!active) params.set('status', 'inactive')
  const qs = params.toString()
  return qs ? `/students?${qs}` : '/students'
}

export function StudentSearch({ q, isActive }: StudentSearchProps) {
  const t = useTranslations('students')
  const router = useRouter()

  const [draft, setDraft] = useDebouncedSearchParam(q, (d) =>
    studentsFilterHref(d, isActive)
  )

  const tabBase =
    'px-4 py-2 text-sm font-medium border transition-colors first:rounded-r-md last:rounded-l-md'
  const tabActive = `${tabBase} bg-blue-50 text-blue-700 border-blue-200`
  const tabInactive = `${tabBase} bg-white text-gray-600 border-gray-200 hover:bg-gray-50`

  return (
    <div className="flex gap-3 items-center">
      <div className="relative flex-1 max-w-sm">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('searchPlaceholder')}
          type="search"
          autoComplete="off"
          className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex">
        <button
          type="button"
          onClick={() => router.push(studentsFilterHref(draft, true))}
          className={isActive ? tabActive : tabInactive}
        >
          {t('filterActive')}
        </button>
        <button
          type="button"
          onClick={() => router.push(studentsFilterHref(draft, false))}
          className={!isActive ? tabActive : tabInactive}
        >
          {t('filterInactive')}
        </button>
      </div>
    </div>
  )
}
