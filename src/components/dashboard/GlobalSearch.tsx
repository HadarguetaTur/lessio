'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { SEARCHABLE_PAGES, filterNav, matchPages } from '@/lib/navigation/registry'
import type { SaasFeatures } from '@/lib/saas/types'
import type { GlobalSearchResponse } from '@/lib/search/types'
import { formatMoney } from '@/lib/i18n/formatCurrency'
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
  /** Undefined = show everything, matching the sidebar's semantics. */
  saasFeatures?: SaasFeatures
  className?: string
}

export function GlobalSearch({ userRole, saasFeatures, className }: GlobalSearchProps) {
  const t = useTranslations('nav.globalSearch')
  const tNav = useTranslations('nav')
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 280)
    return () => clearTimeout(id)
  }, [query])

  const canSeeCharges = userRole === 'owner' || userRole === 'admin'

  // Local, synchronous and independent of the fetch: typing "reminder" used to
  // return nothing at all, because the API only ever searched people and money.
  // Keyed off the raw query rather than the debounced one — there is no request
  // to save here.
  const pageHits = useMemo(
    () =>
      matchPages(query, filterNav(SEARCHABLE_PAGES, userRole, saasFeatures), (entry) =>
        tNav(entry.navKey as Parameters<typeof tNav>[0])
      ),
    [query, userRole, saasFeatures, tNav]
  )

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
    setSelectedIndex(0)
  }, [open, debounced, query])

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

  const money = (n: number) => formatMoney(n, locale)

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

  const resultGroups = useMemo(() => {
    const groups: Array<{ key: string; items: Array<{ href: string; label: string; onSelect: () => void }> }> = []

    if (data?.students.length) {
      groups.push({
        key: 'students',
        items: data.students.map((s) => ({
          href: buildStudentHref(userRole, s.id),
          label: s.full_name,
          onSelect: () => navigateTo(buildStudentHref(userRole, s.id)),
        })),
      })
    }

    if (data?.parents.length) {
      groups.push({
        key: 'parents',
        items: data.parents.map((p) => ({
          href: `/parents/${p.id}/edit`,
          label: p.full_name,
          onSelect: () => navigateTo(`/parents/${p.id}/edit`),
        })),
      })
    }

    if (data?.lessons.length) {
      groups.push({
        key: 'lessons',
        items: data.lessons.map((l) => {
          const names = l.student_names.length ? l.student_names.join(', ') : '—'
          const matchedStudent = data.students.find((s) => l.student_names.includes(s.full_name))
          const lessonHref = buildLessonHref(
            userRole,
            l.id,
            l.start_at,
            userRole === 'teacher' ? undefined : matchedStudent?.id
          )
          return {
            href: lessonHref,
            label: names,
            onSelect: () => navigateTo(lessonHref),
          }
        }),
      })
    }

    if (canSeeCharges && data?.charges.length) {
      groups.push({
        key: 'charges',
        items: data.charges.map((c) => ({
          href: `/charges/${c.id}`,
          label: `${money(c.amount)} · ${c.parent_name}`,
          onSelect: () => navigateTo(`/charges/${c.id}`),
        })),
      })
    }

    if (pageHits.length > 0) {
      groups.push({
        key: 'pages',
        items: pageHits.map((entry) => ({
          href: entry.href,
          label: tNav(entry.navKey as Parameters<typeof tNav>[0]),
          onSelect: () => navigateTo(entry.href),
        })),
      })
    }

    return groups
  }, [canSeeCharges, data, money, navigateTo, pageHits, tNav, userRole])

  /**
   * One flat list behind the keyboard cursor. Every group below marks its rows
   * from this, so what Enter opens is also what the user sees highlighted —
   * before, only the students group tracked the cursor and the rest rendered
   * `aria-selected={false}`, leaving the selection invisible past the first group.
   */
  const flatItems = useMemo(() => resultGroups.flatMap((group) => group.items), [resultGroups])
  const indexOfHref = (href: string) => flatItems.findIndex((item) => item.href === href)

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (!open || !data && pageHits.length === 0) return

      const total = resultGroups.reduce((sum, group) => sum + group.items.length, 0)
      if (total === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % total)
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + total) % total)
      }

      if (event.key === 'Enter') {
        const item = flatItems[selectedIndex]
        if (item) {
          event.preventDefault()
          item.onSelect()
        }
      }
    }

    document.addEventListener('keydown', keyHandler)
    return () => document.removeEventListener('keydown', keyHandler)
  }, [data, flatItems, open, pageHits.length, resultGroups, selectedIndex])

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

          {!loading && !error && query.trim().length >= 2 && data && !hasResults && pageHits.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('noResults')}</p>
          )}

          {data && data.students.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.students')}
              </div>
              {data.students.map((s) => {
                const flatIndex = indexOfHref(buildStudentHref(userRole, s.id))
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === flatIndex}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80',
                      selectedIndex === flatIndex && 'bg-muted/80'
                    )}
                    onClick={() => navigateTo(buildStudentHref(userRole, s.id))}
                  >
                    <span className="font-medium">{s.full_name}</span>
                    {s.grade ? (
                      <span className="text-xs text-muted-foreground">{s.grade}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          {data && data.parents.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.parents')}
              </div>
              {data.parents.map((p) => {
                const flatIndex = indexOfHref(`/parents/${p.id}/edit`)
                return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === flatIndex}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80',
                    selectedIndex === flatIndex && 'bg-muted/80'
                  )}
                  onClick={() => navigateTo(`/parents/${p.id}/edit`)}
                >
                  <span className="font-medium">{p.full_name}</span>
                  {p.phone ? (
                    <span className="text-xs text-muted-foreground">{p.phone}</span>
                  ) : null}
                </button>
                )
              })}
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

                const flatIndex = indexOfHref(lessonHref)

                return (
                  <button
                    key={l.id}
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === flatIndex}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80',
                      selectedIndex === flatIndex && 'bg-muted/80'
                    )}
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
              {data.charges.map((c) => {
                const flatIndex = indexOfHref(`/charges/${c.id}`)
                return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === flatIndex}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted/80',
                    selectedIndex === flatIndex && 'bg-muted/80'
                  )}
                  onClick={() =>
                    navigateTo(`/charges/${c.id}`)
                  }
                >
                  <span className="font-medium">
                    {money(c.amount)} · {c.parent_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.status}</span>
                </button>
                )
              })}
            </div>
          )}

          {pageHits.length > 0 && (
            <div className="mt-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('sections.pages')}
              </div>
              {pageHits.map((entry) => {
                const Icon = entry.icon
                const flatIndex = indexOfHref(entry.href)
                return (
                  <button
                    key={entry.href}
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === flatIndex}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted/80',
                      selectedIndex === flatIndex && 'bg-muted/80'
                    )}
                    onClick={() => navigateTo(entry.href)}
                  >
                    <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-medium">
                      {tNav(entry.navKey as Parameters<typeof tNav>[0])}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
