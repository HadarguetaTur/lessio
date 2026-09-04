'use client'

import { useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  decodeConsent,
  encodeConsent,
} from '@/lib/tracking/consent'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** The raw cookie value, or null. Returning a stable null keeps the snapshot
 *  referentially equal between renders, which the hook requires. */
function readCookie(): string | null {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.split('=')[1]
  return raw ? decodeURIComponent(raw) : null
}

/**
 * The cookie banner.
 *
 * Per /docs/sprint-34-scope.md § C. The privacy policy has named Meta Pixel,
 * GA4, PostHog and Hotjar as third parties since Sprint 23 while the codebase
 * carried no tracking and no banner at all; pixels cannot ship without this.
 *
 * Written from the client rather than through a server action: the decision has
 * to take effect on the page the visitor is already looking at, and a round
 * trip would leave the pixels unloaded until the next navigation.
 *
 * Deliberately three buttons, not two. "Accept all" next to a single "Manage"
 * link is a dark pattern; refusing must be exactly as easy as accepting.
 */
export function ConsentBanner() {
  const t = useTranslations('consent')
  // The parent portal pins its own nav to bottom-0. Sitting at bottom-0 with a
  // higher z-index covered every tab, so a parent arriving from a WhatsApp link
  // could not navigate at all until they answered this.
  const onPortal = usePathname()?.startsWith('/portal/') ?? false

  // useSyncExternalStore, not an effect: the cookie is external state, the
  // server has no view of it, and `getServerSnapshot` returning null is what
  // stops the banner flashing for a visitor who already answered.
  const stored = useSyncExternalStore(subscribe, readCookie, () => null)
  const visible = decodeConsent(stored ?? undefined) === null

  const decide = useCallback((analytics: boolean, marketing: boolean) => {
    const value = encodeConsent({ analytics, marketing, at: new Date().toISOString() })
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(value)}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`
    notify()
    // The scripts are rendered by a server component, so the decision only
    // takes effect on the next render of the tree.
    if (analytics || marketing) window.location.reload()
  }, [])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label={t('title')}
      className={`fixed inset-x-0 z-50 border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur-md ${
        onPortal ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'bottom-0'
      }`}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t('body')}{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            {t('privacyLink')}
          </Link>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => decide(false, false)}>
            {t('rejectAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => decide(true, false)}>
            {t('analyticsOnly')}
          </Button>
          <Button size="sm" onClick={() => decide(true, true)}>
            {t('acceptAll')}
          </Button>
        </div>
      </div>
    </div>
  )
}
