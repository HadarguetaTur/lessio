'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

interface StudentSearchProps {
  q: string
  isActive: boolean
}

export function StudentSearch({ q, isActive }: StudentSearchProps) {
  const router = useRouter()

  function buildUrl(overrides: { q?: string; isActive?: boolean }) {
    const params = new URLSearchParams()
    const nextQ = overrides.q ?? q
    const nextActive = overrides.isActive ?? isActive
    if (nextQ) params.set('q', nextQ)
    if (!nextActive) params.set('status', 'inactive')
    return `/students?${params.toString()}`
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement
    router.push(buildUrl({ q: input.value }))
  }

  const tabBase =
    'px-4 py-2 text-sm font-medium border transition-colors first:rounded-r-md last:rounded-l-md'
  const tabActive = `${tabBase} bg-blue-50 text-blue-700 border-blue-200`
  const tabInactive = `${tabBase} bg-white text-gray-600 border-gray-200 hover:bg-gray-50`

  return (
    <div className="flex gap-3 items-center">
      <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          name="q"
          defaultValue={q}
          placeholder="חיפוש לפי שם..."
          className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      <div className="flex">
        <button
          onClick={() => router.push(buildUrl({ isActive: true }))}
          className={isActive ? tabActive : tabInactive}
        >
          פעיל
        </button>
        <button
          onClick={() => router.push(buildUrl({ isActive: false }))}
          className={!isActive ? tabActive : tabInactive}
        >
          לא פעיל
        </button>
      </div>
    </div>
  )
}
