'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, MessageSquare } from 'lucide-react'
import { INBOX_FILTERS, matchesFilter, type InboxFilter, type InboxTag } from '@/lib/inbox/tags'
import type { InboxRow } from '@/lib/inbox/rows'
import { ConversationRow } from './ConversationRow'

/**
 * The conversation rail: search, filter chips, rows.
 *
 * Filtering and searching are client-side on purpose. The list is bounded (one
 * row per phone over ninety days) and already in memory, so a chip should feel
 * like a chip — instant, no navigation, no server round trip, and no losing
 * the thread you have open in the other pane.
 */
export function InboxList({
  rows,
  tagsByKey,
  timezone,
  locale,
}: {
  rows: InboxRow[]
  /** Derived on the server so the pure tag logic stays out of the bundle. */
  tagsByKey: Record<string, InboxTag[]>
  timezone: string
  locale: string
}) {
  const t = useTranslations('inbox')
  const pathname = usePathname()
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(
    () => ({
      awaiting: rows.filter((r) => matchesFilter(r, 'awaiting')).length,
      taken_over: rows.filter((r) => matchesFilter(r, 'taken_over')).length,
    }),
    [rows]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false
      if (!needle) return true
      const haystack = [
        row.displayName ?? '',
        row.fallbackLabel,
        row.lastMessage,
        row.channel === 'whatsapp' ? row.phone : row.studentName,
        ...(row.channel === 'whatsapp' ? row.studentNames : []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [rows, filter, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ltr:left-2.5 rtl:right-2.5"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="w-full rounded-md border border-border bg-background py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ltr:pl-8 ltr:pr-3 rtl:pr-8 rtl:pl-3"
          />
        </div>

        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {INBOX_FILTERS.map((id) => {
            const active = filter === id
            const count = id === 'awaiting' ? counts.awaiting : id === 'taken_over' ? counts.taken_over : null
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={active}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`filters.${id}`)}
                {count ? ` ${count}` : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <MessageSquare size={22} aria-hidden className="text-muted-foreground" />
            <p className="text-sm font-medium">
              {rows.length === 0 ? t('empty.noConversations') : t('empty.noMatches')}
            </p>
            <p className="text-xs text-muted-foreground">
              {rows.length === 0 ? t('empty.noConversationsHint') : t('empty.noMatchesHint')}
            </p>
          </div>
        ) : (
          visible.map((row) => (
            <ConversationRow
              key={row.key}
              row={row}
              tags={tagsByKey[row.key] ?? []}
              active={pathname === row.href || decodeURIComponent(pathname) === decodeURIComponent(row.href)}
              timezone={timezone}
              locale={locale}
            />
          ))
        )}
      </div>
    </div>
  )
}
