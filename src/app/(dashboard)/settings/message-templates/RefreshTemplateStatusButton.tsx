'use client'

/**
 * Re-reads every template's approval status from the org's WABA.
 *
 * The `message_template_status_update` webhook is the normal path, but it only
 * fires on a transition and needs that field subscribed in the Meta console, so
 * an org that connected earlier would see nothing until its next change. This
 * makes the current state visible on demand — and makes the App Review
 * screencast deterministic instead of waiting on a push.
 */

import { useTransition, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { refreshTemplateStatusesAction } from './actions'

export function RefreshTemplateStatusButton() {
  const t = useTranslations('settings.messageTemplates')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await refreshTemplateStatusesAction()
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="text-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={14} className={isPending ? 'animate-spin' : undefined} />
        {t('refreshStatus')}
      </button>
      {error && <p className="text-xs text-red-600 mt-1.5">{t(`errors.${error}`)}</p>}
    </div>
  )
}
