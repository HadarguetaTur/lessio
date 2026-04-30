'use client'

import { useTransition } from 'react'
import { Download } from 'lucide-react'

interface Props {
  orgId: string
  exportAction: (orgId: string) => Promise<{ json: string }>
}

export function OrgDataExportButton({ orgId, exportAction }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    startTransition(async () => {
      const { json } = await exportAction(orgId)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `org-export-${orgId}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
    >
      <Download size={13} />
      {isPending ? 'Exporting...' : 'Export Data (JSON)'}
    </button>
  )
}
