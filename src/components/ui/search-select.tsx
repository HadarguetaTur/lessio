'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchSelectOption {
  value: string
  label: string
  /** Shown next to the label and matched by the filter (e.g. a phone number). */
  hint?: string
}

interface SearchSelectProps {
  /** Submitted with the form under this name. */
  name: string
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  emptyText: string
  clearLabel: string
  /** Optional first entry that clears the selection (e.g. "No parent"). */
  noneLabel?: string
  required?: boolean
  id?: string
}

/**
 * A picker you can type into.
 *
 * A tutor with 60 students cannot find anyone in a native <select>; this keeps
 * the same form semantics (a hidden input carrying the value) while letting her
 * type a few letters. Keyboard support is the point, not a nicety: arrows move
 * the active option, Enter picks it, Escape closes.
 */
export function SearchSelect({
  name,
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  clearLabel,
  noneLabel,
  required,
  id,
}: SearchSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const inputId = id ?? `${listboxId}-input`

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q)
    )
  }, [options, query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function select(next: string) {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => {
        if (filtered.length === 0) return 0
        return (i + delta + filtered.length) % filtered.length
      })
      return
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      const option = filtered[activeIndex]
      if (option) select(option.value)
      return
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* The form still submits a plain value; only the way you pick it changed. */}
      <input type="hidden" name={name} value={value} required={required} />

      {!open && selected ? (
        <div className="flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-w-0 flex-1 truncate text-start text-foreground"
          >
            <bdi>{selected.label}</bdi>
            {selected.hint && (
              <span className="ms-1.5 text-muted-foreground" dir="ltr">
                {selected.hint}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setQuery('')
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={clearLabel}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground start-3"
          />
          <input
            id={inputId}
            type="text"
            required={required && !value}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              // A new filter means the old highlight points at a different row.
              setActiveIndex(0)
              setOpen(true)
            }}
            onFocus={() => {
              setActiveIndex(0)
              setOpen(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className="flex h-9 w-full rounded-md border border-input bg-background py-1 ps-9 pe-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {noneLabel && !value && (
            <li>
              <button
                type="button"
                onClick={() => select('')}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                {noneLabel}
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-center text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  id={`${listboxId}-${index}`}
                  onClick={() => select(option.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors',
                    index === activeIndex && 'bg-muted',
                    option.value === value && 'font-medium'
                  )}
                >
                  {option.value === value && <Check size={13} className="shrink-0 text-primary" />}
                  <span className="min-w-0 flex-1 truncate">
                    <bdi>{option.label}</bdi>
                    {option.hint && (
                      <span className="ms-1.5 text-xs text-muted-foreground" dir="ltr">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
