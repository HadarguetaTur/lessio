'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Upload } from 'lucide-react'
import { FileUploadZone } from './FileUploadZone'
import { ImportPreviewTable } from './ImportPreviewTable'
import { ImportResultsSummary } from './ImportResultsSummary'
import type { EntityType, ValidatedRow } from '@/lib/import/validators'
import type { ImportResult } from '@/lib/import/executeImport'
import { getEntityTitle, getRequiredFields } from '@/lib/import/entityMeta'

type FlowStep = 'upload' | 'preview' | 'importing' | 'results'

interface ImportFlowProps {
  entityType: EntityType
  orgId: string
  onComplete?: (insertedCount: number) => void
}

export function ImportFlow({ entityType, orgId, onComplete }: ImportFlowProps) {
  const [step, setStep] = useState<FlowStep>('upload')
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set())
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const entityTitle = getEntityTitle(entityType)
  const requiredFields = getRequiredFields(entityType)

  const handleDownloadTemplate = () => {
    window.open(`/api/import/template?type=${entityType}`, '_blank')
  }

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null)
      setParsing(true)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('entityType', entityType)

        const res = await fetch('/api/import/parse', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'שגיאה בעיבוד הקובץ')
          setParsing(false)
          return
        }

        setRows(data.rows)
        // Auto-exclude error rows and duplicate rows
        const autoExclude = new Set<number>()
        for (const row of data.rows as ValidatedRow[]) {
          if (row.status === 'error' || row.existingId) {
            autoExclude.add(row.rowIndex)
          }
        }
        setExcludedRows(autoExclude)
        setStep('preview')
      } catch {
        setError('שגיאה בעיבוד הקובץ. נסה שוב.')
      } finally {
        setParsing(false)
      }
    },
    [entityType]
  )

  const handleToggleRow = (rowIndex: number) => {
    setExcludedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }

  const handleExecute = async () => {
    setStep('importing')
    setError(null)

    const rowsToImport = rows.filter(
      (r) => !excludedRows.has(r.rowIndex) && r.status !== 'error'
    )

    try {
      const res = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, rows: rowsToImport }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'שגיאה בביצוע הייבוא')
        setStep('preview')
        return
      }

      setImportResult(data as ImportResult)
      setStep('results')
      onComplete?.(data.inserted)
    } catch {
      setError('שגיאה בביצוע הייבוא. נסה שוב.')
      setStep('preview')
    }
  }

  const handleReset = () => {
    setStep('upload')
    setRows([])
    setExcludedRows(new Set())
    setImportResult(null)
    setError(null)
  }

  const validCount = rows.filter(
    (r) => !excludedRows.has(r.rowIndex) && r.status !== 'error'
  ).length
  const errorCount = rows.filter((r) => r.status === 'error').length
  const warningCount = rows.filter((r) => r.status === 'warning' && !r.existingId).length
  const duplicateCount = rows.filter((r) => r.existingId).length

  return (
    <div className="space-y-5">
      {/* Step: Upload */}
      {step === 'upload' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                יבוא {entityTitle}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                שדות חובה: {requiredFields.join(', ')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download size={14} className="ml-1.5" />
              הורד תבנית
            </Button>
          </div>

          <FileUploadZone onFileSelect={handleFileSelect} />

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              מעבד את הקובץ...
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              תצוגה מקדימה — {entityTitle}
            </h3>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              העלה קובץ אחר
            </Button>
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
            <span className="text-emerald-600 font-medium">{validCount} תקינות</span>
            {duplicateCount > 0 && (
              <span className="text-orange-600 font-medium">{duplicateCount} כפילויות</span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-600 font-medium">{warningCount} אזהרות</span>
            )}
            {errorCount > 0 && (
              <span className="text-red-600 font-medium">{errorCount} שגיאות</span>
            )}
            <span className="text-muted-foreground">
              מתוך {rows.length} שורות
            </span>
          </div>

          {duplicateCount > 0 && (
            <p className="text-xs text-orange-600">
              סמנו את תיבת הסימון ליד שורות כפולות כדי לדרוס את הרשומה הקיימת
            </p>
          )}

          <ImportPreviewTable
            rows={rows}
            excludedRows={excludedRows}
            onToggleRow={handleToggleRow}
          />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>
              ביטול
            </Button>
            <Button onClick={handleExecute} disabled={validCount === 0}>
              <Upload size={14} className="ml-1.5" />
              ייבא {validCount} שורות
            </Button>
          </div>
        </>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">מייבא נתונים...</p>
        </div>
      )}

      {/* Step: Results */}
      {step === 'results' && importResult && (
        <>
          <ImportResultsSummary result={importResult} />
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleReset}>
              ייבוא נוסף
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
