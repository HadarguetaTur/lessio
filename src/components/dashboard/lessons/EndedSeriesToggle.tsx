'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ENDED_SERIES_ON, ENDED_SERIES_PARAM } from './seriesParams'

/**
 * Reveals the series the list hides by default: the ones with nothing ahead of
 * them, whether they were stopped, removed down to nothing, or simply ran out.
 * Flips `?ended=1` on the current URL, mirroring CancelledToggle on the calendar.
 */
export function EndedSeriesToggle({
  hiddenCount,
  active,
}: {
  hiddenCount: number
  active: boolean
}) {
  const t = useTranslations('lessons.series')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Nothing to reveal and nothing revealed — don't clutter a clean list.
  if (!active && hiddenCount === 0) return null

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (active) params.delete(ENDED_SERIES_PARAM)
    else params.set(ENDED_SERIES_PARAM, ENDED_SERIES_ON)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      title={t('showEndedHint')}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'bg-muted/40 text-muted-foreground hover:text-foreground'
      }`}
    >
      {active ? <Eye size={15} /> : <EyeOff size={15} />}
      <span>
        {t('showEnded')}
        {!active && hiddenCount > 0 ? ` (${hiddenCount})` : ''}
      </span>
    </button>
  )
}
