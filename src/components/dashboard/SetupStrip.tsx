'use client'

/**
 * The one place the dashboard says "you are not live yet".
 *
 * Dismissable, but only for a week: an org that is still missing its WhatsApp
 * number a month later has not decided against it, it has forgotten.
 */

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { X, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'

export type SetupGap = 'whatsapp' | 'ai' | 'payment'

const HREFS: Record<SetupGap, string> = {
  whatsapp: '/settings/whatsapp',
  ai: '/settings/ai-assistant',
  payment: '/settings/payment',
}

const DISMISS_DAYS = 7
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000

/** Org-scoped: a superadmin in support mode hops between tenants. */
function storageKey(orgId: string): string {
  return `lessio.setup-strip.${orgId}`
}

function dismissedRecently(orgId: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey(orgId))
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < DISMISS_MS
  } catch {
    // Private mode, blocked site data — treat as "never dismissed".
    return false
  }
}

/** Nothing outside React mutates the dismissal, so there is nothing to watch. */
const noSubscribe = () => () => {}

interface Props {
  orgId: string
  missing: SetupGap[]
  /** Chevron direction follows the reading direction. */
  isRtl?: boolean
}

export function SetupStrip({ orgId, missing, isRtl }: Props) {
  const t = useTranslations('dashboard.setup')
  // The dismissal lives in localStorage, which the server cannot see. The
  // server snapshot is "hidden", so the markup matches on hydration and the
  // strip appears on the client pass if it has not been dismissed.
  const hiddenByStorage = useSyncExternalStore(
    noSubscribe,
    () => dismissedRecently(orgId),
    () => true
  )
  const [dismissedNow, setDismissedNow] = useState(false)

  if (hiddenByStorage || dismissedNow || missing.length === 0) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey(orgId), String(Date.now()))
    } catch {
      // Nothing to do — it will simply reappear next visit.
    }
    setDismissedNow(true)
  }

  const Chevron = isRtl ? ArrowLeft : ArrowRight

  return (
    <div className="animate-in fade-in-0 mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <AlertCircle size={16} className="shrink-0" aria-hidden />
          {t('title')}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('dismiss')}
          className="-me-1 -mt-1 rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
        >
          <X size={15} />
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {missing.map((gap) => (
          <li key={gap}>
            <Link
              href={HREFS[gap]}
              className="group flex items-start gap-2 text-sm text-amber-800 underline decoration-from-font underline-offset-4 hover:text-amber-900 hover:underline"
            >
              <Chevron
                size={14}
                className="mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
              <span>
                {t(`items.${gap}` as 'items.whatsapp')}
                {' '}
                <span className="font-medium">{t('connectNow')}</span>
                {' '}
                <span aria-hidden="true">←</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
