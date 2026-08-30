import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'

import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { LocaleToggle } from '@/components/i18n/LocaleToggle'
import { getOrgServiceState, isServiceSuspended } from '@/lib/saas/subscriptions'

/**
 * Parent portal shell — mobile-first, no Supabase session.
 * Max-width 480px centered on large screens.
 * Per /docs/sprint-13-scope.md § Story 6.
 */
export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const serviceState = await getOrgServiceState(orgId)

  return (
    // The root layout body is `overflow-hidden`, so this shell must provide its
    // own scroll container or anything below the first viewport is unreachable.
    <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted/50" dir={dir}>
      <div className="absolute top-2 end-2 z-20">
        <LocaleToggle currentLocale={locale} action={setLandingLocaleAction} />
      </div>
      <div className="max-w-[480px] mx-auto min-h-full bg-card shadow-sm flex flex-col">
        {isServiceSuspended(serviceState) ? <ServiceUnavailable /> : children}
      </div>
    </div>
  )
}

/**
 * Shown instead of any portal page while the org's subscription is suspended.
 *
 * The gate lives in the layout rather than in the login actions so that a
 * parent already holding a session cookie is stopped too — the feature check it
 * replaces only ran on new logins, so an existing cookie kept working for up to
 * a week. It also replaces a `redirect()` to /account/billing, a dashboard
 * route the parent cannot open: the middleware bounced them to the teachers'
 * login screen, a page with no explanation and nothing to do with them.
 *
 * Says nothing about billing. The parent is not a party to the teacher's
 * subscription, and "your teacher did not pay" is not ours to disclose.
 */
async function ServiceUnavailable() {
  const t = await getTranslations('portal.serviceUnavailable')

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">{t('unavailableTitle')}</h1>
      <p className="max-w-[36ch] text-sm text-muted-foreground">{t('unavailableBody')}</p>
    </main>
  )
}
