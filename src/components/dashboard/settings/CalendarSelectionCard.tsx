'use client'

/**
 * Which of the connected Google account's calendars are consulted by the
 * lesson-conflict check. Shared between the org settings page and the teacher
 * calendar-connect page — the save server action arrives as a prop (the
 * server-action-prop rule; never imported here directly).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CalendarListEntry, SelectedCalendar } from '@/lib/google-calendar'

export type SaveCalendarSelectionAction = (
  ids: string[]
) => Promise<{ ok: boolean; error?: string }>

export function CalendarSelectionCard({
  calendars,
  selected,
  listError,
  saveAction,
}: {
  calendars:  CalendarListEntry[] | null
  selected:   SelectedCalendar[]
  listError:  boolean
  saveAction: SaveCalendarSelectionAction
}) {
  const t = useTranslations('settings.calendarSelection')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [checkedIds, setCheckedIds] = useState<string[]>(selected.map(c => c.id))
  const [result, setResult] = useState<'saved' | string | null>(null)

  // Previously selected calendars that no longer appear in the fresh list
  // (deleted/unsubscribed on Google's side) — shown so they can be unchecked.
  const listedIds = new Set((calendars ?? []).map(c => c.id))
  const unavailable = selected.filter(c => !listedIds.has(c.id))

  const toggle = (id: string) => {
    setResult(null)
    setCheckedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSave = () => {
    setResult(null)
    startTransition(async () => {
      const res = await saveAction(checkedIds)
      setResult(res.ok ? 'saved' : (res.error ?? t('saveError')))
      if (res.ok) router.refresh()
    })
  }

  const rowLabel = (entry: { id: string; summary: string | null; primary?: boolean }) =>
    entry.id === 'primary' ? t('primaryCalendar') : (entry.summary ?? entry.id)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-900">{t('title')}</h2>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} />
          {t('refresh')}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('hint')}</p>

      {listError ? (
        <p className="text-sm text-red-600">{t('listError')}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {(calendars ?? []).map(entry => (
              <li key={entry.id}>
                <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={checkedIds.includes(entry.id)}
                    onChange={() => toggle(entry.id)}
                    disabled={pending}
                  />
                  <span>{rowLabel(entry)}</span>
                </label>
              </li>
            ))}
            {unavailable.map(entry => (
              <li key={entry.id}>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={checkedIds.includes(entry.id)}
                    onChange={() => toggle(entry.id)}
                    disabled={pending}
                  />
                  <span>{rowLabel(entry)}</span>
                  <span className="text-xs rounded bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5">
                    {t('unavailableCalendar')}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={pending || checkedIds.length === 0}
            >
              {t('save')}
            </Button>
            {checkedIds.length === 0 && (
              <span className="text-xs text-red-600">{t('noneSelected')}</span>
            )}
            {result === 'saved' && (
              <span className="text-xs text-green-700">{t('saved')}</span>
            )}
            {result && result !== 'saved' && (
              <span className="text-xs text-red-600">{result}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
