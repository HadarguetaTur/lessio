/**
 * Which translation namespaces each area ships to the browser.
 *
 * `messages/he.json` is ~300 KB. The root layout used to hand the whole file
 * to `NextIntlClientProvider`, so every page — the login form, the landing
 * page, a parent's portal — carried the full dashboard, admin and onboarding
 * copy in its RSC payload, and again on every `router.refresh()`.
 *
 * Server components are unaffected: `getTranslations()` reads the full file on
 * the server. Only `useTranslations()` in client components reads from the
 * provider, so each area lists the namespaces its client components use.
 * Nested providers REPLACE the parent's messages (they do not merge), so each
 * list is complete on its own.
 *
 * Adding a `useTranslations('x')` call to a client component in an area whose
 * list lacks `x` renders the raw key and logs a MISSING_MESSAGE error — the
 * fix is to add the namespace here. `scratch: node scripts/i18n-namespaces.js`
 * is not needed; grep for `useTranslations(` under the area's components.
 */

import type { AbstractIntlMessages } from 'next-intl'

/** A top-level namespace (`'settings'`) or a dotted path (`'admin.orgs.exitSupport'`). */
type MessagePath = string

/**
 * Pages outside every route group: landing, login/signup, legal, error
 * boundaries, the consent banner and the global toaster.
 */
export const ROOT_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'auth',
  'consent',
  'nav',
  'notFound',
  'meta',
  'legal',
  'validation',
  'saas',
]

/** The org dashboard, including the teacher sub-shell. */
export const DASHBOARD_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'nav',
  'validation',
  'dashboard',
  'students',
  'studentProfile',
  'lessons',
  'parents',
  'teachers',
  'teacherSelf',
  'billing',
  'charges',
  'debts',
  'subscriptions',
  'receipts',
  'homework',
  'import',
  'inbox',
  'waConversations',
  'broadcasts',
  'whatsappCapability',
  'leads',
  'notifications',
  'reports',
  'settings',
  'support',
  'saas',
  'quota',
  'onboarding.checkoutPreview',
  // SupportModeBanner (a superadmin inspecting an org) — three strings, not
  // the whole 20 KB admin namespace.
  'admin.supportBanner',
  'admin.readOnly',
  'admin.orgs.exitSupport',
]

/** The superadmin console. */
export const ADMIN_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'nav',
  'validation',
  'admin',
  'support',
  'saas',
  'subscriptions',
  'notifications',
]

/** Parent portal (phone-OTP session). */
export const PORTAL_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'validation',
  'portal',
  'booking',
  'consent',
]

/** Booking WebView (`/book/[token]`). */
export const BOOKING_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'validation',
  'booking',
  'portal',
]

/** Onboarding wizard — reuses the import flow and plan selection. */
export const ONBOARDING_MESSAGE_NAMESPACES: readonly MessagePath[] = [
  'common',
  'errors',
  'nav',
  'validation',
  'auth',
  'onboarding',
  'import',
  'students',
  'lessons',
  'teachers',
  'settings',
  'saas',
  'quota',
]

/**
 * Returns the subset of `messages` under the given paths, preserving nesting.
 * Unknown paths are skipped silently: a namespace that does not exist in one
 * language must not break the other.
 */
export function pickMessages(
  messages: AbstractIntlMessages,
  paths: readonly MessagePath[]
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {}
  for (const path of paths) {
    const segments = path.split('.')
    let source: unknown = messages
    for (const segment of segments) {
      if (source === null || typeof source !== 'object') {
        source = undefined
        break
      }
      source = (source as Record<string, unknown>)[segment]
    }
    if (source === undefined) continue

    let target = out
    for (const segment of segments.slice(0, -1)) {
      const next = target[segment]
      if (next === undefined || typeof next !== 'object') {
        target[segment] = {}
      }
      target = target[segment] as AbstractIntlMessages
    }
    target[segments[segments.length - 1]] = source as AbstractIntlMessages[string]
  }
  return out
}
