'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import type { GlobalSearchResponse } from '@/lib/search/types'
import { cn } from '@/lib/utils'

function buildStudentHref(role: string, studentId: string): string {
  if (role === 'teacher') {
    return '/homework/assign'
  }
  const params = new URLSearchParams({ tab: 'students', openStudent: studentId })
  return `/students?${params.toString()}`
}

function weekSundayFromIso(startAt: string): string {
  const d = new Date(`${startAt.slice(0, 10)}T12:00:00Z`)
  const dow = d.getUTCDay()
  const sun = new Date(d.getTime() - dow * 24 * 60 * 60 * 1000)
  return sun.toISOString().substring(0, 10)
}

function buildLessonHref(
  role: string,
  lessonId: string,
  startAt: string,
  studentId?: string
): string {
  if (role === 'teacher') {
    return `/teacher/schedule/${lessonId}`
  }
  const params = new URLSearchParams({
    view: 'week',
    week: weekSundayFromIso(startAt),
  })
  if (studentId) params.set('student', studentId)
  return `/lessons?${params.toString()}`
}

interface GlobalSearchProps {
  userRole: string
  className?: string
}

export function GlobalSearch({ userRole, className }: GlobalSearchProps) {
  const t = useTranslations('nav.globalSearch')
  const router = useRouter()
  const locale = useLocale()
  const uiLocale = parseAppLocale(locale)
  const intlLocale = toIntlLocale(uiLocale)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<GlobalSearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 280)
    return () => clearTimeout(id)
  }, [query])

  const canSeeCharges = userRole === 'owner' || userRole === 'admin'

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `search_${res.status}`)
      }
      const json = (await res.json()) as GlobalSearchResponse
      setData(json)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'search_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void runSearch(debounced)
  }, [debounced, open, runSearch])

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const formatLessonWhen = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))

  const formatMoney = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

  function navigateTo(href: string) {
    setOpen(false)
    setQuery('')
    setDebounced('')
    setData(null)
    router.push(href)
  }

  const hasResults =
    data &&
    (data.students.length > 0 ||
      data.parents.length > 0 ||
      data.lessons.length > 0 ||
      (canSeeCharges && data.charges.length > 0))

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 text-muted-foreground opacity-70"
          style={{
            [uiLocale === 'he' ? 'right' : 'left']: '0.65rem',
            transform: 'translateY(-50%)',
          }}
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={t('placeholder')}
          aria-label={t('ariaLabel')}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(
            'h-9 bg-muted/50 text-sm',
            uiLocale === 'he' ? 'pr-9 pl-3' : 'pl-9 pr-3'
          )}
        />
        {loading && (
          <Loader2
            size={16}
            className="absolute top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            style={{ [uiLocale === 'he' ? 'left' : 'right']: '0.65rem' }}
            aria-hidden
          />
        )}
      </div>

      {open && (
        <div
          className="absolute top-full z-50 mt-1 max-h-[min(24rem,70vh)] w-full overflow-y-auto rounded-md border border-border bg-popover py-2 text-popover-foreground shadow-md"
          role="listbox"
          id={listboxId}
        >
          {query.trim().length < 2 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('minLength')}</p>
          )}

          {error && query.trim().length >= 2 && (
            <p className="px-3 py-2 text-xs text-destructive">{t('error')}</p>
          )}

          {/* Without this the panel is an empty box for the whole round-trip:
              every section below needs `data`, which is null until the first
              response lands. */}
          {loading && !error && query.trim().length >= 2 && !data && (
            <div className="space-y-2 px-3 py-2" aria-live="polite" aria-busy="true">
              <span className="sr-only">{t('loading')}</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded-md" />
              ))}
            </div>
          )}

          {!loading && !error && query.trim().length >= 2 && data && !hasResults && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('noResults')}</p>
          )}

          {data && data.students.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.students')}
              </div>
              {data.students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80"
                  onClick={() => navigateTo(buildStudentHref(userRole, s.id))}
                >
                  <span className="font-medium">{s.full_name}</span>
                  {s.grade ? (
                    <span className="text-xs text-muted-foreground">{s.grade}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {data && data.parents.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.parents')}
              </div>
              {data.parents.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80"
                  onClick={() => navigateTo(`/parents/${p.id}/edit`)}
                >
                  <span className="font-medium">{p.full_name}</span>
                  {p.phone ? (
                    <span className="text-xs text-muted-foreground">{p.phone}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {data && data.lessons.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.lessons')}
              </div>
              {data.lessons.map((l) => {
                const names = l.student_names.length ? l.student_names.join(', ') : '—'
                const matchedStudent = data.students.find((s) => l.student_names.includes(s.full_name))
                const lessonHref = buildLessonHref(
                  userRole,
                  l.id,
                  l.start_at,
                  userRole === 'teacher' ? undefined : matchedStudent?.id
                )

                return (
                  <button
                    key={l.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80"
                    onClick={() => navigateTo(lessonHref)}
                  >
                    <span className="font-medium">{formatLessonWhen(l.start_at)}</span>
                    <span className="text-xs text-muted-foreground">{names}</span>
                  </button>
                )
              })}
            </div>
          )}

          {canSeeCharges && data && data.charges.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.charges')}
              </div>
              {data.charges.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80"
                  onClick={() =>
                    navigateTo(`/charges/${c.id}`)
                  }
                >
                  <span className="font-medium">
                    {formatMoney(c.amount)} · {c.parent_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
