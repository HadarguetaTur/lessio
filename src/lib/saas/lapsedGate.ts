/**
 * What a lapsed organization may still reach.
 *
 * A trial that ended, a card that stayed declined past the grace window, or a
 * cancelled subscription all leave the org readable but not workable. Until now
 * that state showed only as a banner, so the practical experience of a trial
 * ending was that the WhatsApp bot went silent and nothing said why.
 *
 * The gate is deliberately narrow. Blocking every screen would take the owner's
 * data hostage — they must be able to read it, export it, and reach support
 * while deciding whether to pay. So only the *working* surfaces are blocked:
 * the dashboard the app opens on, the settings that configure automations that
 * are switched off anyway, and the growth surfaces. Everything that shows the
 * data itself stays open, and writes are refused separately by
 * `requireWritableOrg`.
 */

import { isOrgSaasReadOnly, isTrialExpired, type OrgSubscriptionState } from './subscriptions'

export type LapsedReason = 'trial_ended' | 'past_due_locked' | 'cancelled'

/** Why the org is locked, or null when it is not. */
export function lapsedReasonFor(state: OrgSubscriptionState | null): LapsedReason | null {
  if (!state || !isOrgSaasReadOnly(state)) return null
  if (state.status === 'cancelled') return 'cancelled'
  if (state.status === 'past_due') return 'past_due_locked'
  if (state.status === 'trial' && isTrialExpired(state)) return 'trial_ended'
  // read_only reached by any route — most often an expired trial the nightly
  // checker has already converted.
  return state.trialEndsAt ? 'trial_ended' : 'past_due_locked'
}

/**
 * Surfaces a lapsed org is redirected away from. Not a denylist of everything
 * else: data pages (/students, /lessons, /charges, /billing, /reports,
 * /homework, /parents), /account/*, /support and /settings/privacy stay
 * reachable so the owner can read and export.
 */
export const LAPSED_BLOCKED_PREFIXES = [
  '/dashboard',
  '/settings',
  '/leads',
  '/teachers',
  '/subscriptions',
  '/messages',
] as const

/** Settings pages that stay open — the ones needed to leave, not to operate. */
const LAPSED_SETTINGS_EXCEPTIONS = ['/settings/privacy'] as const

export function isLapsedBlockedPath(pathname: string): boolean {
  if (LAPSED_SETTINGS_EXCEPTIONS.some((p) => pathname.startsWith(p))) return false
  return LAPSED_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
