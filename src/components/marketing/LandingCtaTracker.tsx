'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

/**
 * Reports clicks on any element carrying data-cta to whichever consented
 * pixels TrackingScripts has loaded (GA4 / Meta Pixel / GTM dataLayer).
 *
 * Renders nothing. Before consent none of the globals exist, so this is a
 * no-op — exactly the behavior the consent banner promises. Server-side
 * conversion events (CompleteRegistration / StartTrial / Purchase) are fired
 * separately by src/lib/tracking/events.ts; this covers the top of the
 * funnel: which landing CTA started the visit.
 */
export function LandingCtaTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-cta]')
      const cta = target?.getAttribute('data-cta')
      if (!cta) return
      try {
        window.gtag?.('event', 'cta_click', { cta_id: cta })
        window.fbq?.('trackCustom', 'CtaClick', { cta })
        window.dataLayer?.push({ event: 'cta_click', cta_id: cta })
      } catch {
        // Tracking must never break navigation.
      }
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [])

  return null
}
