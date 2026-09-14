import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { BOOKING_MESSAGE_NAMESPACES, pickMessages } from '@/i18n/clientMessages'

import { getLocale } from 'next-intl/server'

import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { LocaleToggle } from '@/components/i18n/LocaleToggle'

/**
 * Booking WebView shell.
 * The root layout body is `overflow-hidden`, so every route group must provide
 * its own scroll container — without this, anything below the first viewport
 * is clipped and unreachable on mobile.
 */
async function BookLayoutShell({ children }: { children: React.ReactNode }) {
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

/**
 * Scopes the client-side translation bundle to this area — see
 * src/i18n/clientMessages.ts. The shell above is unchanged; it just renders
 * inside a provider that carries only the namespaces its client components use.
 */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])
  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, BOOKING_MESSAGE_NAMESPACES)}>
      <BookLayoutShell>{children}</BookLayoutShell>
    </NextIntlClientProvider>
  )
}
