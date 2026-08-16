import { getLocale } from 'next-intl/server'

import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { LocaleToggle } from '@/components/i18n/LocaleToggle'

/**
 * Booking WebView shell.
 * The root layout body is `overflow-hidden`, so every route group must provide
 * its own scroll container — without this, anything below the first viewport
 * is clipped and unreachable on mobile.
 */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-background"
      dir={dir}
    >
      <div className="absolute top-2 end-2 z-10">
        <LocaleToggle currentLocale={locale} action={setLandingLocaleAction} />
      </div>
      {children}
    </div>
  )
}
