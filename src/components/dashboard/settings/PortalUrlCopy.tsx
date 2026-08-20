'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Check } from 'lucide-react'
import { getShareableBaseUrl } from '@/lib/url/appUrl'

interface PortalUrlCopyProps {
  orgId: string
}

export function PortalUrlCopy({ orgId }: PortalUrlCopyProps) {
  const t = useTranslations('common.actions')
  const [copied, setCopied] = useState(false)

  // Owners copy this link and send it to parents, so it must be the public
  // origin even when the dashboard itself is being served from localhost.
  const portalUrl = `${getShareableBaseUrl()}/portal/${orgId}`

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
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  )
}
