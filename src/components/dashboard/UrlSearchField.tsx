'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { SearchField } from '@/components/ui/search-field'
import { useDebouncedSearchParam } from '@/lib/hooks/useDebouncedSearchParam'

interface UrlSearchFieldProps {
  /** The current value of the query param, as read by the server page. */
  q: string
  placeholder: string
  /** Query-string key to write. Defaults to `q`. */
  param?: string
  className?: string
}

/**
 * Search box for server-rendered lists: writes the draft to the URL
 * (debounced) while preserving every other query param on the page, so it
 * composes with status tabs, month pickers and the like without each page
 * rebuilding its own href logic.
 */
export function UrlSearchField({ q, placeholder, param = 'q', className }: UrlSearchFieldProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [draft, setDraft] = useDebouncedSearchParam(q, (d) => {
    const params = new URLSearchParams(searchParams.toString())
    if (d) params.set(param, d)
    else params.delete(param)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  })

  return (
    <SearchField
      name={param}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={className}
    />
  )
}
