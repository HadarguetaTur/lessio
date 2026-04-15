'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Download, Loader2, Upload } from 'lucide-react'
import { FileUploadZone } from './FileUploadZone'
import { ImportPreviewTable } from './ImportPreviewTable'
import { ImportResultsSummary } from './ImportResultsSummary'
import type { EntityType, ValidatedRow } from '@/lib/import/validators'
import type { ImportResult } from '@/lib/import/executeImport'
import { getRequiredFieldKeys } from '@/lib/import/entityMeta'

type FlowStep = 'upload' | 'preview' | 'importing' | 'results'

interface ImportFlowProps {
  entityType: EntityType
  orgId: string
  onComplete?: (insertedCount: number) => void
}

export function ImportFlow({ entityType, orgId, onComplete }: ImportFlowProps) {
  void orgId
  const t = useTranslations('import')
  const tCommon = useTranslations('common.actions')
  const [step, setStep] = useState<FlowStep>('upload')
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set())
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const entityTitle = useMemo(() => {
    switch (entityType) {
      case 'students':
        return t('entities.students')
      case 'parents':
        return t('entities.parents')
      case 'teachers':
        return t('entities.teachers')
      case 'lessons-schedule':
        return t('entities.lessonsSchedule')
      case 'lessons-history':
        return t('entities.lessonsHistory')
      case 'family-list':
        return t('entities.familyList')
    }
  }, [entityType, t])

  const requiredFieldLabels = useMemo(() => {
    return getRequiredFieldKeys(entityType).map((k) => t(`fields.${k}` as never))
  }, [entityType, t])

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
          setError(data.error || t('flowErrors.parseFailed'))
          setParsing(false)
          return
        }

        setRows(data.rows)
        const autoExclude = new Set<number>()
        for (const row of data.rows as ValidatedRow[]) {
          if (row.status === 'error' || row.existingId) {
            autoExclude.add(row.rowIndex)
          }
        }
        setExcludedRows(autoExclude)
        setStep('preview')
      } catch {
        setError(t('flowErrors.parseFailedRetry'))
      } finally {
        setParsing(false)
      }
    },
    [entityType, t]
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
        setError(data.error || t('flowErrors.executeFailed'))
        setStep('preview')
        return
      }

      setImportResult(data as ImportResult)
      setStep('results')
      onComplete?.(data.inserted)
    } catch {
      setError(t('flowErrors.executeFailedRetry'))
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
      {step === 'upload' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {t('title', { entity: entityTitle })}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('requiredFields', { fields: requiredFieldLabels.join(', ') })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download size={14} className="ms-1.5" />
              {t('downloadTemplate')}
            </Button>
          </div>

          <FileUploadZone onFileSelect={handleFileSelect} />

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t('processing')}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}

      {step === 'preview' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              {t('preview.title', { entity: entityTitle })}
            </h3>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t('uploadFile')}
            </Button>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-4 py-2.5 text-sm flex-wrap">
            <span className="text-emerald-600 font-medium">
              {t('preview.valid', { count: validCount })}
            </span>
            {duplicateCount > 0 && (
              <span className="text-orange-600 font-medium">
                {t('preview.duplicates', { count: duplicateCount })}
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-amber-600 font-medium">
                {t('preview.warnings', { count: warningCount })}
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-red-600 font-medium">
                {t('preview.errors', { count: errorCount })}
              </span>
            )}
            <span className="text-muted-foreground">
              {t('preview.total', { count: rows.length })}
            </span>
          </div>

          {duplicateCount > 0 && (
            <p className="text-xs text-orange-600">{t('preview.duplicateHint')}</p>
          )}

          <ImportPreviewTable rows={rows} excludedRows={excludedRows} onToggleRow={handleToggleRow} />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleExecute} disabled={validCount === 0}>
              <Upload size={14} className="ms-1.5" />
              {t('preview.import', { count: validCount })}
            </Button>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('importing')}</p>
        </div>
      )}

      {step === 'results' && importResult && (
        <>
          <ImportResultsSummary result={importResult} />
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleReset}>
              {t('results.importMore')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
