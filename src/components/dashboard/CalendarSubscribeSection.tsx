'use client'

/**
 * CalendarSubscribeSection — client component for the iCal subscription UI.
 * Per /docs/sprint-16-scope.md § Story 4.
 *
 * Features:
 * - Displays the full subscription URL
 * - Copy to clipboard button
 * - Regenerate token button (calls server action)
 * - Collapsed instructions for Google / Apple / Outlook
 */

import React, { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { regenerateCalendarTokenAction } from '@/app/(dashboard)/teacher/calendar/actions'

interface CalendarSubscribeSectionProps {
  icalUrl: string
}

export function CalendarSubscribeSection({ icalUrl }: CalendarSubscribeSectionProps) {
  const t = useTranslations('teacherSelf.calendar')
  const tCommon = useTranslations('common')
  const [copied, setCopied] = useState(false)
  const [regenerateError, setRegenerateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCopy() {
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleRegenerate() {
    setRegenerateError(null)
    startTransition(async () => {
      const result = await regenerateCalendarTokenAction()
      if (result.error) {
        setRegenerateError(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* URL display + copy */}
      <div className="space-y-2">
        <label htmlFor="ical-url" className="text-sm font-medium text-gray-700">
          {t('subscriptionUrl')}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="ical-url"
            type="text"
            readOnly
            value={icalUrl}
            dir="ltr"
            className="flex-1 text-xs font-mono border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-700 select-all focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleCopy}
            title={t('copyLink')}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-700" />
                <span className="text-green-700">{tCommon('actions.copied')}</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                {tCommon('actions.copy')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Regenerate token */}
      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          {t('regenerateWarning')}
        </p>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
          {isPending ? `${t('regenerate')}…` : t('regenerate')}
        </button>
        {regenerateError && (
          <p className="text-xs text-red-600">{regenerateError}</p>
        )}
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">{t('addToCalendar')}</p>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            {t('googleTitle')}
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100">
            <p>1. {t('googleStep1')}</p>
            <p>2. {t('googleStep2')}</p>
            <p>3. {t('googleStep3')}</p>
            <p className="text-xs text-muted-foreground mt-2">{t('googleNote')}</p>
          </div>
        </details>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            {t('appleTitle')}
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100">
            <p><strong>{t('appleIphone')}</strong></p>
            <p>1. {t('appleIphoneStep1')}</p>
            <p>2. {t('appleIphoneStep2')}</p>
            <p>3. {t('appleIphoneStep3')}</p>
            <p className="mt-2"><strong>{t('appleMac')}</strong></p>
            <p>1. {t('appleMacStep1')}</p>
            <p>2. {t('appleMacStep2')}</p>
          </div>
        </details>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            Outlook
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100">
            <p>1. {t('outlookStep1')}</p>
            <p>2. {t('outlookStep2')}</p>
            <p>3. {t('outlookStep3')}</p>
          </div>
        </details>
      </div>
    </div>
  )
}
