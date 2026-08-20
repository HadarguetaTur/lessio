'use client'

/**
 * Interval-based refresh for the parent portal.
 *
 *   <PollingRefresh intervalMs={30_000} />
 *
 * The portal deliberately does NOT use Realtime. Its visitors authenticate with
 * a signed JWT in an httpOnly cookie (src/lib/portal/), not a Supabase Auth
 * session, so the browser has no credential a Realtime socket could present and
 * RLS would reject every subscription. Polling is the honest answer there.
 *
 * Refreshes only while the tab is actually visible: a phone left on a portal
 * page in a background tab should not wake up every 15 seconds to re-render.
 * A refresh that came due while hidden runs once the tab is looked at again, so
 * returning to the tab always shows current data.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function PollingRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()
  const missedRef = useRef(false)

  useEffect(() => {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return

    const tick = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      } else {
        missedRef.current = true
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!missedRef.current) return
      missedRef.current = false
      router.refresh()
    }

    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, router])

  return null
}
