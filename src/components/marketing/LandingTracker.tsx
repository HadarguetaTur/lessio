'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

import { LANDING_SECTIONS } from '@/lib/landing-analytics/sections'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

const ENDPOINT = '/api/telemetry/pageview'

/**
 * Seconds after load at which progress is sent even if nothing else triggers
 * it. The Facebook in-app browser — where most group-post visitors arrive —
 * routinely fires neither `pagehide` nor `visibilitychange` when it is closed,
 * so a tracker that only flushes on exit loses exactly the visits this exists
 * to measure. With these the worst case is a visit under-reported by the gap
 * to the previous beat, never a missing one.
 */
const HEARTBEATS_S = [10, 30, 60, 120, 300]

/** Bounds what one pageview can cost us, whatever the page does. */
const MAX_SENDS = 10

/**
 * Measures a landing pageview: which sections were reached, how long the tab
 * was actually looked at, and which CTA was clicked.
 *
 * First-party and anonymous — it posts to our own endpoint, which keys the row
 * on the random visitor cookie and stores no IP — so unlike the pixels below
 * it does not wait for the consent banner (docs/decisions.md). CTA clicks are
 * still forwarded to whichever consented pixels TrackingScripts has loaded;
 * before consent those globals do not exist and that part is a no-op.
 *
 * Renders nothing, holds no React state, and must never break navigation.
 */
export function LandingTracker({
  locale,
  scrollRootId,
}: {
  locale: 'he' | 'en'
  /** The element that actually scrolls — <body> is overflow-hidden. */
  scrollRootId: string
}) {
  const pathname = usePathname()

  useEffect(() => {
    const id = crypto.randomUUID()
    const startedAt = performance.now()

    let sections = 0
    let scrollPct = 0
    let engagedMs = 0
    let visibleSince: number | null =
      document.visibilityState === 'visible' ? performance.now() : null
    const ctas: string[] = []
    let firstCtaMs: number | undefined
    let lastCta = ''
    let lastCtaAt = 0

    let sends = 0
    let lastSent = ''

    const engagedNow = () =>
      Math.round(engagedMs + (visibleSince == null ? 0 : performance.now() - visibleSince))

    const send = (force = false) => {
      if (sends >= MAX_SENDS) return
      // Engaged time counts in 10s steps: someone reading one section for a
      // minute is news, a tab that merely stayed open in the background is not.
      const state = `${sections}|${scrollPct}|${ctas.length}|${Math.floor(engagedNow() / 10_000)}`
      // A heartbeat with nothing new to say is not worth a database write.
      if (!force && state === lastSent && sends > 0) return
      lastSent = state
      sends += 1

      const body = JSON.stringify({
        id,
        path: pathname,
        search: window.location.search.slice(0, 1000),
        referrer: document.referrer.slice(0, 500) || undefined,
        sections,
        scrollPct,
        engagedMs: Math.min(engagedNow(), 3_600_000),
        ctas,
        firstCtaMs,
        locale,
      })

      try {
        // text/plain: a JSON content type makes sendBeacon a preflighted request,
        // which several in-app browsers then drop.
        const blob = new Blob([body], { type: 'text/plain' })
        if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
          void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {})
        }
      } catch {
        // Measurement must never surface to the visitor.
      }
    }

    // ── sections ────────────────────────────────────────────────────────────
    // Default root: <body> does not scroll (the diary wrapper does), but an
    // observer still honours ancestor clipping — LandingStickyCta relies on the
    // same thing. A section counts once a quarter of the viewport has passed it.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = LANDING_SECTIONS.indexOf(entry.target.id as (typeof LANDING_SECTIONS)[number])
          if (index >= 0) sections |= 1 << index
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -25% 0px' }
    )
    for (const sectionId of LANDING_SECTIONS) {
      const el = document.getElementById(sectionId)
      if (el) observer.observe(el)
    }

    // ── scroll depth ────────────────────────────────────────────────────────
    const scroller = document.getElementById(scrollRootId)
    const onScroll = () => {
      if (!scroller) return
      const range = scroller.scrollHeight - scroller.clientHeight
      if (range <= 0) return
      scrollPct = Math.max(scrollPct, Math.min(100, Math.round((scroller.scrollTop / range) * 100)))
    }
    scroller?.addEventListener('scroll', onScroll, { passive: true })

    // ── engaged time ────────────────────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibleSince = performance.now()
        return
      }
      if (visibleSince != null) engagedMs += performance.now() - visibleSince
      visibleSince = null
      send()
    }
    const onPageHide = () => send()

    // ── CTA clicks ──────────────────────────────────────────────────────────
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest?.('[data-cta]')
      const cta = target?.getAttribute('data-cta')
      if (!cta) return

      const now = performance.now()
      // One tap can arrive as two clicks (label + control, or a double tap).
      if (cta === lastCta && now - lastCtaAt < 1000) return
      lastCta = cta
      lastCtaAt = now

      if (ctas.length < 12) ctas.push(cta)
      firstCtaMs ??= Math.round(now - startedAt)
      // Navigation follows a CTA, so this cannot wait for a heartbeat.
      send(true)

      try {
        window.gtag?.('event', 'cta_click', { cta_id: cta, page_path: pathname })
        window.fbq?.('trackCustom', 'CtaClick', { cta, page_path: pathname })
        window.dataLayer?.push({ event: 'cta_click', cta_id: cta, page_path: pathname })
      } catch {
        // Tracking must never break navigation.
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('click', onClick, { capture: true })

    // The opening beacon is what makes a bounce countable at all. Deferred by a
    // tick so a mount that is torn down immediately (React's dev double-invoke,
    // an instant redirect) never becomes a ghost visit of its own.
    const opening = window.setTimeout(() => send(true), 0)
    const timers = HEARTBEATS_S.map((s) =>
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') send()
      }, s * 1000)
    )

    return () => {
      window.clearTimeout(opening)
      // A soft navigation away (e.g. to /signup) unmounts without a pagehide.
      // Only for a pageview that was actually opened.
      if (sends > 0) send()
      timers.forEach((t) => window.clearTimeout(t))
      observer.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('click', onClick, { capture: true })
    }
  }, [pathname, locale, scrollRootId])

  return null
}
