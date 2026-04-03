'use client'

import { Download } from 'lucide-react'

interface CsvDownloadButtonProps {
  report: string
  params?: Record<string, string>
  label?: string
}

/**
 * Client component that triggers a CSV download from /api/reports/[report].
 */
export function CsvDownloadButton({
  report,
  params = {},
  label = 'יצוא CSV',
}: CsvDownloadButtonProps) {
  function handleDownload() {
    const qs = new URLSearchParams(params).toString()
    const url = `/api/reports/${report}${qs ? `?${qs}` : ''}`
    const a = document.createElement('a')
    a.href = url
    a.download = `${report}.csv`
    a.click()
  }

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors"
    >
      <Download size={14} />
      {label}
    </button>
  )
}
