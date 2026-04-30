'use client'

import { useTranslations } from 'next-intl'
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Link2 } from 'lucide-react'
import type { ImportResult } from '@/lib/import/executeImport'

interface ImportResultsSummaryProps {
  result: ImportResult
}

export function ImportResultsSummary({ result }: ImportResultsSummaryProps) {
  const t = useTranslations('import')
  const hasUpdated = result.updated > 0
  const hasLinked = (result.linkedRelationships ?? 0) > 0
  const hasFailedLinks = (result.failedLinks?.length ?? 0) > 0

  const colCount = [true, hasUpdated, hasLinked, true, true].filter(Boolean).length

  return (
    <div className="rounded-xl border border-border p-6 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{t('results.title')}</h3>

      <div className={`grid gap-3 grid-cols-${colCount}`} style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-emerald-700">{result.inserted}</div>
            <div className="text-xs text-emerald-600">{t('results.inserted')}</div>
          </div>
        </div>

        {hasUpdated && (
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
            <RefreshCw size={20} className="text-blue-600 shrink-0" />
            <div>
              <div className="text-xl font-bold text-blue-700">{result.updated}</div>
              <div className="text-xs text-blue-600">{t('results.updated')}</div>
            </div>
          </div>
        )}

        {hasLinked && (
          <div className="flex items-center gap-3 rounded-lg bg-violet-50 p-3">
            <Link2 size={20} className="text-violet-600 shrink-0" />
            <div>
              <div className="text-xl font-bold text-violet-700">{result.linkedRelationships}</div>
              <div className="text-xs text-violet-600">{t('results.linkedRelationships')}</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-amber-700">{result.skipped}</div>
            <div className="text-xs text-amber-600">{t('results.skipped')}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3">
          <XCircle size={20} className="text-red-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-red-700">{result.errors.length}</div>
            <div className="text-xs text-red-600">{t('results.errors')}</div>
          </div>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">{t('results.errorDetails')}</h4>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-3 space-y-1">
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t('results.row', { row: err.row })}:
                </span>{' '}
                {err.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {hasFailedLinks && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">{t('results.failedLinks')}</h4>
          <div className="max-h-36 overflow-y-auto rounded-lg bg-amber-50 p-3 space-y-1">
            {result.failedLinks!.map((fl, i) => (
              <p key={i} className="text-xs text-amber-800">
                <span className="font-medium">{t('results.row', { row: fl.row })}:</span>{' '}
                {fl.message ?? t('results.failedLinkDetail', { name: fl.name })}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
