'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The one table the admin console uses.
 *
 * Per /docs/sprint-34-scope.md § מבנה המידע החדש. Every admin screen used to
 * hand-roll its own markup with no sort, no paging and no export, so a list
 * longer than a screen was unusable and getting numbers out meant SQL.
 *
 * Cells arrive already rendered (server components format money and dates in
 * the request's locale). `sortValue` and `csv` carry the raw values, because a
 * rendered "₪1,234" sorts as a string and exports as one too.
 */

export type AdminTableColumn = {
  key: string
  label: string
  align?: 'start' | 'end'
  /** Numeric or id-like content: tabular figures, no wrapping. */
  numeric?: boolean
  sortable?: boolean
  /** Hidden below `lg`. For columns that are useful but not load-bearing. */
  secondary?: boolean
}

export type AdminTableRow = {
  id: string
  href?: string
  cells: Record<string, React.ReactNode>
  /** Raw values for sorting. Missing keys fall back to no ordering. */
  sortValues?: Record<string, string | number | null>
  /** Raw values for CSV. Missing keys export empty. */
  csv?: Record<string, string | number | null>
}

const PAGE_SIZE = 25

function toCsvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function AdminTable({
  columns,
  rows,
  emptyLabel,
  exportName,
  pageSize = PAGE_SIZE,
}: {
  columns: AdminTableColumn[]
  rows: AdminTableRow[]
  emptyLabel: string
  /** Base filename for the CSV. Omit to hide the export button. */
  exportName?: string
  pageSize?: number
}) {
  const t = useTranslations('admin.table')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => {
      const av = a.sortValues?.[key]
      const bv = b.sortValues?.[key]
      // Rows with no value for the sorted column sink, in both directions —
      // "unknown" is not the smallest value, it is the least interesting one.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  function toggleSort(key: string) {
    setPage(0)
    setSort((s) =>
      s?.key === key
        ? s.dir === 'asc'
          ? { key, dir: 'desc' }
          : null // third click clears, rather than trapping the default order
        : { key, dir: 'asc' }
    )
  }

  function exportCsv() {
    if (!exportName) return
    const header = columns.map((c) => toCsvField(c.label)).join(',')
    const body = sorted
      .map((r) => columns.map((c) => toCsvField(r.csv?.[c.key])).join(','))
      .join('\n')
    // BOM so Excel opens Hebrew columns as UTF-8 rather than mojibake.
    const blob = new Blob([`﻿${header}\n${body}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background px-5 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => {
                const active = sort?.key === c.key
                const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'px-4 py-2.5 text-xs font-medium text-muted-foreground',
                      c.align === 'end' ? 'text-end' : 'text-start',
                      c.secondary && 'hidden lg:table-cell'
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        aria-label={`${t('sortBy')} ${c.label}`}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                          active && 'font-semibold text-foreground'
                        )}
                      >
                        {c.label}
                        <Icon size={12} className={active ? '' : 'opacity-40'} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-muted/40">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3 align-middle',
                      c.align === 'end' ? 'text-end' : 'text-start',
                      c.numeric && 'tabular-nums whitespace-nowrap',
                      c.secondary && 'hidden lg:table-cell'
                    )}
                  >
                    {r.cells[c.key] ?? <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('showing', {
            from: sorted.length === 0 ? 0 : safePage * pageSize + 1,
            to: Math.min((safePage + 1) * pageSize, sorted.length),
            total: sorted.length,
          })}
        </p>
        <div className="flex items-center gap-1.5">
          {exportName && (
            <Button variant="ghost" size="sm" onClick={exportCsv}>
              <Download size={13} />
              {t('exportCsv')}
            </Button>
          )}
          {pageCount > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                {t('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                {t('next')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
