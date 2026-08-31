'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CANCELLED_ON, CANCELLED_PARAM } from './calendarParams'

interface CancelledToggleProps {
  /** Cancelled lessons the calendar suppresses at this range — drives the counter. */
  hiddenCount: number
  active: boolean
}

/**
 * Reveals the cancelled lessons the calendar hides by default (see filterCalendarLessons).
 * Flips `?cancelled=1` on the current URL, so it works unchanged on /lessons and
 * /teacher/schedule across all three views without any date or teacher props.
 */
export function CancelledToggle({ hiddenCount, active }: CancelledToggleProps) {
  const t = useTranslations('lessons')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Nothing to reveal and nothing revealed — don't clutter a clean calendar.
  if (!active && hiddenCount === 0) return null

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (active) {
      params.delete(CANCELLED_PARAM)
    } else {
      params.set(CANCELLED_PARAM, CANCELLED_ON)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      title={t('showCancelledHint')}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'bg-muted/40 text-muted-foreground hover:text-foreground'
      }`}
    >
      {active ? <Eye size={15} /> : <EyeOff size={15} />}
      <span>
        {t('showCancelled')}
        {!active && hiddenCount > 0 ? ` (${hiddenCount})` : ''}
      </span>
    </button>
  )
}
