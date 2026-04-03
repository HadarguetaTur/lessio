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
import { Copy, Check, RefreshCw } from 'lucide-react'
import { regenerateCalendarTokenAction } from '@/app/(dashboard)/teacher/calendar/actions'

interface CalendarSubscribeSectionProps {
  icalUrl: string
}

export function CalendarSubscribeSection({ icalUrl }: CalendarSubscribeSectionProps) {
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
        <label className="text-sm font-medium text-gray-700">קישור המנוי שלך</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={icalUrl}
            dir="ltr"
            className="flex-1 text-xs font-mono border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-700 select-all focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleCopy}
            title="העתק קישור"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-600" />
                <span className="text-green-600">הועתק</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                העתק
              </>
            )}
          </button>
        </div>
      </div>

      {/* Regenerate token */}
      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-xs text-gray-500">
          חידוש קישור יבטל מיידית את כל המנויים הקיימים. תצטרך להוסיף מחדש את הקישור החדש בכל אפליקציות הלוח שנה שלך.
        </p>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
          {isPending ? 'מחדש קישור...' : 'חדש קישור'}
        </button>
        {regenerateError && (
          <p className="text-xs text-red-600">{regenerateError}</p>
        )}
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">הוספה לאפליקציית לוח שנה</p>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            גוגל קלנדר
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100" dir="rtl">
            <p>1. פתח את <strong>Google Calendar</strong> בדפדפן</p>
            <p>2. בסרגל השמאלי, לחץ על <strong>"לוחות שנה אחרים"</strong> → <strong>"מ-URL"</strong></p>
            <p>3. הדבק את הקישור ולחץ <strong>"הוסף לוח שנה"</strong></p>
            <p className="text-xs text-gray-400 mt-2">שים לב: Google מסנכרן מנויי iCal כל ~24 שעות.</p>
          </div>
        </details>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            אפל קלנדר (iPhone / Mac)
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100" dir="rtl">
            <p><strong>iPhone/iPad:</strong></p>
            <p>1. פתח <strong>הגדרות</strong> → <strong>לוח שנה</strong> → <strong>חשבונות</strong></p>
            <p>2. לחץ <strong>"הוסף חשבון"</strong> → <strong>"אחר"</strong> → <strong>"הוסף לוח שנה במנוי"</strong></p>
            <p>3. הדבק את הקישור ולחץ <strong>הבא</strong></p>
            <p className="mt-2"><strong>Mac:</strong></p>
            <p>1. פתח <strong>לוח שנה</strong> → תפריט <strong>קובץ</strong> → <strong>"מנוי חדש..."</strong></p>
            <p>2. הדבק את הקישור ולחץ <strong>מנוי</strong></p>
          </div>
        </details>

        <details className="border border-gray-200 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg">
            Outlook
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm text-gray-600 space-y-1 border-t border-gray-100" dir="rtl">
            <p>1. פתח <strong>Outlook</strong> בדפדפן (outlook.com או Office 365)</p>
            <p>2. לחץ <strong>"הוסף לוח שנה"</strong> → <strong>"מ-אינטרנט"</strong></p>
            <p>3. הדבק את הקישור בשדה URL ולחץ <strong>ייבא</strong></p>
          </div>
        </details>
      </div>
    </div>
  )
}
