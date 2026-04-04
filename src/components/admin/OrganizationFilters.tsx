'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export function OrganizationFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="search"
        placeholder="חפש שם או slug..."
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => update('search', e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56"
      />
      <select
        defaultValue={searchParams.get('status') ?? ''}
        onChange={(e) => update('status', e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <option value="">כל הסטטוסים</option>
        <option value="active">פעיל</option>
        <option value="inactive">לא פעיל</option>
        <option value="needs_setup">דורש הגדרה</option>
      </select>
      <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          defaultChecked={searchParams.get('missingSetup') === '1'}
          onChange={(e) => update('missingSetup', e.target.checked ? '1' : '')}
          className="rounded"
        />
        חסרה הגדרה בלבד
      </label>
    </div>
  )
}
