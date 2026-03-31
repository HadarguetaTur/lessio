'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface PortalUrlCopyProps {
  orgId: string
}

export function PortalUrlCopy({ orgId }: PortalUrlCopyProps) {
  const [copied, setCopied] = useState(false)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const portalUrl = `${appUrl}/portal/${orgId}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the text
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={portalUrl}
        dir="ltr"
        className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-xs text-gray-700 bg-gray-50 font-mono truncate"
      />
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shrink-0"
      >
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
        {copied ? 'הועתק!' : 'העתק'}
      </button>
    </div>
  )
}
