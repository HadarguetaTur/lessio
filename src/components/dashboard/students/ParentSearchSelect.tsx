'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export function ParentSearchSelect({
  parents,
  value,
  onChange,
}: {
  parents: { id: string; full_name: string; phone: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useTranslations('students')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selected = parents.find((p) => p.id === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return parents
    const q = query.trim().toLowerCase()
    return parents.filter(
      (p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q)
    )
  }, [parents, query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name="parent_id" value={value} />

      {!open && selected ? (
        <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 text-right truncate text-foreground"
          >
            {selected.full_name}
            <span className="text-muted-foreground mr-1.5">({selected.phone})</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 mr-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('card.removeParent')}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={t('card.searchParentPlaceholder')}
            className="flex h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoComplete="off"
          />
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {!value && (
            <button
              type="button"
              onClick={() => handleSelect('')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t('card.noParentOption')}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">{t('card.noParentsFound')}</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-right',
                  p.id === value && 'bg-primary/5'
                )}
              >
                {p.id === value && <Check size={13} className="shrink-0 text-primary" />}
                <span className="flex-1 truncate">
                  {p.full_name}
                  <span className="text-muted-foreground mr-1.5 text-xs">({p.phone})</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
