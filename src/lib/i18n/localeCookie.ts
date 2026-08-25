import type { AppLocale } from '@/lib/i18n/serverTranslator'

export const LOCALE_COOKIE = 'locale'

/**
 * One definition of the locale cookie, shared by every writer (login, signup,
 * the OAuth callback, the settings action and the public-page switcher).
 *
 * They used to each spell the options out, and none set `secure`. On a host
 * that mixes apex and www — or http and https — a cookie written under one
 * origin is unreadable under the other, so the language appears to flip back
 * on its own. `httpOnly` stays false on purpose: it is a display preference,
 * not a credential, and client code reads it.
 */
export const LOCALE_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: false,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as const

type CookieWriter = {
  set: (name: string, value: string, options: typeof LOCALE_COOKIE_OPTIONS) => unknown
}

export function setLocaleCookie(store: CookieWriter, locale: AppLocale): void {
  store.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS)
}
