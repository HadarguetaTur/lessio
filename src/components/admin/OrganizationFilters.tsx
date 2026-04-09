'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SEARCH_URL_DEBOUNCE_MS } from '@/lib/hooks/useDebouncedSearchParam'

export function OrganizationFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('admin')

  const paramsBaseRef = useRef('')

  useEffect(() => {
    paramsBaseRef.current = searchParams.toString()
  }, [searchParams])

  const urlSearch = searchParams.get('search') ?? ''
  const [searchDraft, setSearchDraft] = useState(urlSearch)

  useEffect(() => {
    setSearchDraft(urlSearch)
  }, [urlSearch])

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(paramsBaseRef.current)
      if (searchDraft) params.set('search', searchDraft)
      else params.delete('search')
      const qs = params.toString()
      const next = qs ? `${pathname}?${qs}` : pathname
      const cur = `${window.location.pathname}${window.location.search}`
      if (cur === next) return
      router.replace(next, { scroll: false })
    }, SEARCH_URL_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, router, pathname])

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchDraft) params.set('search', searchDraft)
      else params.delete('search')
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams, searchDraft]
  )

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="search"
        placeholder={t('orgs.filters.searchPlaceholder')}
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        autoComplete="off"
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56"
      />
      <select
        defaultValue={searchParams.get('status') ?? ''}
        onChange={(e) => update('status', e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <option value="">{t('orgs.filters.allStatuses')}</option>
        <option value="active">{t('orgs.status.active')}</option>
        <option value="inactive">{t('orgs.status.inactive')}</option>
        <option value="needs_setup">{t('orgs.status.needs_setup')}</option>
      </select>
      <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          defaultChecked={searchParams.get('missingSetup') === '1'}
          onChange={(e) => update('missingSetup', e.target.checked ? '1' : '')}
          className="rounded"
        />
        {t('orgs.filters.missingSetupOnly')}
      </label>
    </div>
  )
}
