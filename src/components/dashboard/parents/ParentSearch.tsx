'use client'

import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

interface ParentSearchProps {
  q: string
}

export function ParentSearch({ q }: ParentSearchProps) {
  const router = useRouter()

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement
    const params = new URLSearchParams()
    if (input.value) params.set('q', input.value)
    router.push(`/parents?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSearch} className="relative max-w-sm">
      <Search
        size={15}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        name="q"
        defaultValue={q}
        placeholder="חיפוש לפי שם או טלפון..."
        className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  )
}
