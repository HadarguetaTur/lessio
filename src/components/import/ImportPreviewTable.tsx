'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, AlertTriangle, X, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import type { ValidatedRow } from '@/lib/import/validators'

const IMPORT_FIELD_KEYS = new Set([
  'full_name',
  'phone',
  'phone_number',
  'email',
  'teacher_name',
  'student_name',
  'day_of_week',
  'start_time',
  'end_time',
  'duration_minutes',
  'date',
  'grade',
  'level',
  'focused_subject',
  'weekly_quota',
  'notes',
  'status',
  'student_names',
  'bio',
  'hourly_rate',
  'lesson_type',
  'cancel_reason',
  'parent_name',
  'parent_phone',
  'parent_name_2',
  'parent_phone_2',
  'student_notes',
  'parent_notes',
  'parent_email',
  'parent_second_phone',
  'parent_address',
  'parent_relation_type',
  'second_phone',
  'address',
  'relation_type',
])

interface ImportPreviewTableProps {
  rows: ValidatedRow[]
  excludedRows: Set<number>
  onToggleRow: (rowIndex: number) => void
}

const STATUS_ICON = {
  valid: <Check size={14} className="text-emerald-700" />,
  warning: <AlertTriangle size={14} className="text-amber-600" />,
  error: <X size={14} className="text-red-600" />,
}

const STATUS_BG: Record<string, string> = {
  valid: 'bg-emerald-50/50',
  warning: 'bg-amber-50/50',
  error: 'bg-red-50/50',
  duplicate: 'bg-orange-50/50',
}

export function ImportPreviewTable({
  rows,
  excludedRows,
  onToggleRow,
}: ImportPreviewTableProps) {
  const t = useTranslations('import')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  if (rows.length === 0) return null

  const columns = Object.keys(rows[0].data).filter(
    (k) => rows.some((r) => r.data[k] != null && r.data[k] !== '')
  )

  const columnTitle = (col: string) => (
    IMPORT_FIELD_KEYS.has(col) ? t(`fields.${col}` as never) : col
  )

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2.5 w-10" />
              <th className="px-3 py-2.5 text-start text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-12">
                #
              </th>
              <th className="px-3 py-2.5 text-start text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16">
                {t('table.status')}
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-start text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {columnTitle(col)}
                </th>
              ))}
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const isExcluded = excludedRows.has(row.rowIndex)
              const isDuplicate = !!row.existingId
              const hasDetails = row.errors.length > 0 || row.warnings.length > 0
              const isExpanded = expandedRow === row.rowIndex
              const bgKey = isDuplicate ? 'duplicate' : row.status
              const rowCls = `${STATUS_BG[bgKey]} ${isExcluded ? 'opacity-40' : ''} transition-opacity`

              return (
                <React.Fragment key={row.rowIndex}>
                  <tr className={rowCls}>
                    <td className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={!isExcluded && row.status !== 'error'}
                        disabled={row.status === 'error'}
                        onChange={() => onToggleRow(row.rowIndex)}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-2.5 w-12 text-xs text-muted-foreground">
                      {row.rowIndex + 2}
                    </td>
                    <td className="px-3 py-2.5 w-16">
                      {isDuplicate ? (
                        <span className="inline-flex items-center gap-1 text-orange-600">
                          <Copy size={14} />
                          <span className="text-[10px] font-medium">{t('table.duplicate')}</span>
                        </span>
                      ) : (
                        STATUS_ICON[row.status]
                      )}
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-3 py-2.5 text-sm text-foreground truncate max-w-[180px]"
                      >
                        {row.data[col] || '-'}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 w-10">
                      {hasDetails && (
                        <button
                          onClick={() =>
                            setExpandedRow(isExpanded ? null : row.rowIndex)
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr className={rowCls}>
                      <td colSpan={columns.length + 4} className="px-12 pb-3 pt-0">
                        <div className="space-y-1">
                          {row.errors.map((err, i) => (
                            <p key={i} className="text-xs text-red-600">
                              {err}
                            </p>
                          ))}
                          {row.warnings.map((warn, i) => (
                            <p key={i} className="text-xs text-amber-600">
                              {warn}
                            </p>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
