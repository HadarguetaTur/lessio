'use client'

import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import type { ImportResult } from '@/lib/import/executeImport'

interface ImportResultsSummaryProps {
  result: ImportResult
}

export function ImportResultsSummary({ result }: ImportResultsSummaryProps) {
  const hasUpdated = result.updated > 0

  return (
    <div className="rounded-xl border border-border p-6 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">תוצאות הייבוא</h3>

      <div className={`grid gap-3 ${hasUpdated ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-emerald-700">{result.inserted}</div>
            <div className="text-xs text-emerald-600">יובאו בהצלחה</div>
          </div>
        </div>

        {hasUpdated && (
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
            <RefreshCw size={20} className="text-blue-600 shrink-0" />
            <div>
              <div className="text-xl font-bold text-blue-700">{result.updated}</div>
              <div className="text-xs text-blue-600">עודכנו</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-amber-700">{result.skipped}</div>
            <div className="text-xs text-amber-600">דולגו</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3">
          <XCircle size={20} className="text-red-600 shrink-0" />
          <div>
            <div className="text-xl font-bold text-red-700">{result.errors.length}</div>
            <div className="text-xs text-red-600">שגיאות</div>
          </div>
        </div>
      </div>

      {result.errors.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-foreground mb-2">פירוט שגיאות:</h4>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-3 space-y-1">
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">שורה {err.row}:</span>{' '}
                {err.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
