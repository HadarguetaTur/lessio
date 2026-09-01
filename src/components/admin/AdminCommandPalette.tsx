'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2, CornerDownLeft, Loader2, Search } from 'lucide-react'

import {
  ADMIN_NAV,
  ADMIN_OVERVIEW,
  adminCategoryFor,
  filterAdminNav,
  matchAdminPages,
} from '@/lib/navigation/adminRegistry'
import type { PlatformCapability } from '@/lib/superadmin/capabilities'
import { cn } from '@/lib/utils'

/**
 * ⌘K navigation for the admin shell.
 *
 * Per /docs/sprint-34-scope.md § מבנה המידע החדש. Opens on ⌘K / Ctrl+K, or
 * from the sidebar's search button via the `admin:open-command-palette` event.
 *
 * Two kinds of result: the console's own pages, matched locally, and
 * organizations, matched by the server. Typing a tenant's name and pressing
 * Enter is the single most common thing an operator does here, so orgs rank
 * below an exact page match but above everything else.
 */

type OrgHit = { id: string; name: string; slug: string }

type Row =
  | { kind: 'page'; key: string; label: string; group: string; href: string }
  | { kind: 'org'; key: string; label: string; group: string; href: string; slug: string }

export function AdminCommandPalette({
  capabilities,
}: {
  capabilities: readonly PlatformCapability[]
}) {
  const router = useRouter()
  const t = useTranslations('admin')

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [orgs, setOrgs] = useState<OrgHit[]>([])
  const [searching, setSearching] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)


  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setOrgs([])
    setCursor(0)
  }, [])

  // ── open / close ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onOpenEvent() {
      setOpen(true)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('admin:open-command-palette', onOpenEvent)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('admin:open-command-palette', onOpenEvent)
    }
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // ── org lookup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const term = query.trim()
    if (!open || term.length < 2) {
      setOrgs([])
      setSearching(false)
      return
    }

    // Abort in flight on every keystroke: without this, a slow early response
    // can land after a later one and repopulate the list with stale hits.
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/org-search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { organizations?: OrgHit[] }
        setOrgs(body.organizations ?? [])
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setOrgs([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 180)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, open])

  const term = query.trim()
  const visiblePages = [ADMIN_OVERVIEW, ...filterAdminNav(ADMIN_NAV, capabilities)]
  const matched =
    term.length === 0
      ? visiblePages
      : matchAdminPages(term, visiblePages, (e) => t(e.navKey), visiblePages.length)

  const pageRows: Row[] = matched.map((entry) => ({
    kind: 'page',
    key: `page:${entry.href}`,
    label: t(entry.navKey),
    group: t(adminCategoryFor(entry.href)?.sectionKey ?? 'groups.pages'),
    href: entry.href,
  }))

  const orgRows: Row[] = orgs.map((o) => ({
    kind: 'org',
    key: `org:${o.id}`,
    label: o.name,
    group: t('nav.orgs'),
    href: `/admin/orgs/${o.id}`,
    slug: o.slug,
  }))

  const rows = [...pageRows, ...orgRows]
  const activeIndex = Math.min(cursor, Math.max(rows.length - 1, 0))

  function go(row: Row | undefined) {
    if (!row) return
    close()
    router.push(row.href)
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (rows.length === 0 ? 0 : (c + 1) % rows.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (rows.length === 0 ? 0 : (c - 1 + rows.length) % rows.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(rows[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  if (!open) return null

  let lastGroup: string | null = null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.searchPlaceholder')}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder={t('nav.searchPlaceholder')}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searching && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t('nav.noResults')}
            </p>
          )}

          {rows.map((row, i) => {
            const header = row.group !== lastGroup ? row.group : null
            lastGroup = row.group
            const active = i === activeIndex
            return (
              <div key={row.key}>
                {header && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(row)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                  )}
                >
                  {row.kind === 'org' && <Building2 size={14} className="shrink-0" />}
                  <span className="truncate">{row.label}</span>
                  {row.kind === 'org' && (
                    <span className="truncate font-mono text-xs opacity-60">{row.slug}</span>
                  )}
                  {active && <CornerDownLeft size={13} className="ms-auto shrink-0 opacity-50" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
