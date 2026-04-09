'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export const SEARCH_URL_DEBOUNCE_MS = 300

/**
 * Local draft for a URL-backed search string, synced when the URL changes (e.g. back/forward),
 * and debounced router.replace so the server sees updated searchParams.
 */
export function useDebouncedSearchParam(
  paramValueFromUrl: string,
  getHrefForDraft: (draft: string) => string
) {
  const router = useRouter()
  const hrefBuilderRef = useRef(getHrefForDraft)
  hrefBuilderRef.current = getHrefForDraft

  const [draft, setDraft] = useState(paramValueFromUrl)

  useEffect(() => {
    setDraft(paramValueFromUrl)
  }, [paramValueFromUrl])

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = hrefBuilderRef.current(draft)
      const cur = `${window.location.pathname}${window.location.search}`
      if (cur === next) return
      router.replace(next, { scroll: false })
    }, SEARCH_URL_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, router])

  return [draft, setDraft] as const
}
