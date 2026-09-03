'use client'

import { useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSizeMb?: number
}

export function FileUploadZone({
  onFileSelect,
  accept = '.csv',
  maxSizeMb = 5,
}: FileUploadZoneProps) {
  const t = useTranslations('import')
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null)

      const validExtensions = ['.csv']
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (!validExtensions.includes(ext)) {
        setError(t('fileErrors.unsupportedFormat'))
        return
      }

      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(t('fileErrors.fileTooLarge', { maxSize: maxSizeMb }))
        return
      }

      setSelectedFile(file)
      onFileSelect(file)
    },
    [maxSizeMb, onFileSelect, t]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      if (e.dataTransfer.files[0]) {
        validateAndSelect(e.dataTransfer.files[0])
      }
    },
    [validateAndSelect]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
        validateAndSelect(e.target.files[0])
      }
    },
    [validateAndSelect]
  )

  const clearFile = () => {
    setSelectedFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Upload size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">{t('dropzone.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('dropzone.formats', { maxSize: maxSizeMb })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={20} className="text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(selectedFile.size)}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFile}>
            <X size={14} />
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
