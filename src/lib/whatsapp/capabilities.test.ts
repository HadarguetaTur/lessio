import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ALL_CAPABILITY_REASONS,
  ALL_UNLOCKS,
  computeWaCapabilities,
  formatUntil,
  toLockedInfo,
  type CapabilityInput,
  type WaCapabilityKey,
} from './capabilities'
import type { WaConnectionState } from './connectionState'
import { WARM_UP_CAMPAIGN_CAP, YELLOW_CAMPAIGN_CAP, type GuardOrg } from './broadcast/guard'

/**
 * The matrix the 14.09 review asked for, pinned: every reason a WhatsApp
 * capability can be closed or limited, and which surfaces it touches. The bug
 * being prevented is a surface inventing its own verdict — "no broadcasts yet"
 * where the truth was "not in your plan".
 */

// 12:00 Jerusalem, mid-September — inside every sending window.
const NOW = new Date('2026-09-14T09:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function activeConnection(over: Partial<WaConnectionState> = {}): WaConnectionState {
  return {
    state: 'active',
    reasons: [],
    needsAction: false,
    lastCheckedAt: daysAgo(0),
    displayPhoneNumber: '+972 50-123-4567',
    verifiedName: 'Studio Michal',
    hasNumber: true,
    ...over,
  }
}

function guardOrg(over: Partial<GuardOrg> = {}): GuardOrg {
  return {
    whatsappPhoneNumberId: 'pn-1',
    waHealthError: null,
    waAccountRestricted: false,
    waQualityRating: 'GREEN',
    waMessagingLimitTier: 'TIER_1K',
    waBusinessVerificationStatus: 'verified',
    waConnectedAt: daysAgo(90),
    broadcastsEnabled: true,
    timezone: 'Asia/Jerusalem',
    quietStart: 8,
    quietEnd: 21,
    maxPromoPerWeek: 1,
    maxUpdatesPerWeek: 3,
    subscriptionLapsed: false,
    ...over,
  }
}

/** A verified owner on a full plan with a settled number: nothing is closed. */
function healthy(over: Partial<CapabilityInput> = {}): CapabilityInput {
  return {
    connection: activeConnection(),
    guardOrg: guardOrg(),
    features: { whatsapp_automation: true, broadcasts: true },
    role: 'owner',
    isSaasReadOnly: false,
    securityCentreUrl: 'https://business.facebook.com/settings/security?business_id=biz-1',
    now: NOW,
    ...over,
  }
}

const ALL_KEYS: WaCapabilityKey[] = [
  'conversations',
  'service_updates',
  'promo_broadcasts',
  'lists',
  'linked_groups',
]

describe('computeWaCapabilities() — baseline', () => {
  it('opens everything for a verified owner with a settled number', () => {
    const caps = computeWaCapabilities(healthy())
    for (const key of ALL_KEYS) {
      expect(caps[key].status, key).toBe('available')
      expect(caps[key].reason, key).toBeNull()
      expect(caps[key].reasons, key).toEqual([])
    }
  })
})

describe('computeWaCapabilities() — who you are and what you bought', () => {
  it('locks the staff tools for a teacher, and leaves the thread tools alone', () => {
    const caps = computeWaCapabilities(healthy({ role: 'teacher' }))
    expect(caps.lists.reason).toBe('role')
    expect(caps.promo_broadcasts.reason).toBe('role')
    expect(caps.linked_groups.reason).toBe('role')
    expect(caps.lists.unlock).toBe('ask_owner')
    expect(caps.lists.unlockHref).toBeNull()
    expect(caps.conversations.status).toBe('available')
    expect(caps.service_updates.status).toBe('available')
  })

  it('says plan_whatsapp for everything when WhatsApp was never sold — even over a dead number', () => {
    const caps = computeWaCapabilities(
      healthy({
        features: { whatsapp_automation: false, broadcasts: false },
        connection: activeConnection({ state: 'reconnect_required', reasons: ['token_invalid'] }),
        guardOrg: guardOrg({ waHealthError: 'token_invalid' }),
      })
    )
    for (const key of ALL_KEYS) {
      expect(caps[key].status, key).toBe('locked')
      expect(caps[key].reason, key).toBe('plan_whatsapp')
      expect(caps[key].unlockHref, key).toBe('/account/billing?upgrade=whatsapp_automation')
    }
  })

  it('says plan_broadcasts for everything but conversations on a plan without broadcasts', () => {
    const caps = computeWaCapabilities(healthy({ features: { whatsapp_automation: true, broadcasts: false } }))
    expect(caps.conversations.status).toBe('available')
    for (const key of ['service_updates', 'promo_broadcasts', 'lists', 'linked_groups'] as const) {
      expect(caps[key].reason, key).toBe('plan_broadcasts')
      expect(caps[key].unlock, key).toBe('upgrade_plan')
      expect(caps[key].unlockHref, key).toBe('/account/billing?upgrade=broadcasts')
    }
  })

  it('role wins over plan: a teacher on a plan without broadcasts is told about the role', () => {
    const caps = computeWaCapabilities(
      healthy({ role: 'teacher', features: { whatsapp_automation: true, broadcasts: false } })
    )
    expect(caps.lists.reason).toBe('role')
    expect(caps.service_updates.reason).toBe('plan_broadcasts')
  })

  it('reads and creates nothing while the subscription is lapsed', () => {
    const caps = computeWaCapabilities(
      healthy({ isSaasReadOnly: true, guardOrg: guardOrg({ subscriptionLapsed: true }) })
    )
    expect(caps.lists.reason).toBe('subscription_lapsed')
    expect(caps.lists.unlock).toBe('renew_subscription')
    expect(caps.service_updates.reason).toBe('subscription_lapsed')
    expect(caps.linked_groups.reason).toBe('subscription_lapsed')
    expect(caps.conversations.status).toBe('limited')
    expect(caps.conversations.reason).toBe('subscription_lapsed')
  })
})

describe('computeWaCapabilities() — the number', () => {
  it('locks sending, not lists, when no number is connected', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'not_connected', hasNumber: false }),
        guardOrg: guardOrg({ whatsappPhoneNumberId: null }),
      })
    )
    expect(caps.lists.status).toBe('available')
    expect(caps.conversations.reason).toBe('not_connected')
    expect(caps.conversations.unlockHref).toBe('/settings/whatsapp')
    expect(caps.service_updates.reason).toBe('not_connected')
    expect(caps.promo_broadcasts.reason).toBe('not_connected')
    expect(caps.linked_groups.reason).toBe('not_connected')
  })

  it('says reconnect_required when Meta rejects the stored credentials', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'reconnect_required', reasons: ['token_invalid'] }),
        guardOrg: guardOrg({ waHealthError: 'token_invalid' }),
      })
    )
    expect(caps.conversations.reason).toBe('reconnect_required')
    expect(caps.service_updates.reason).toBe('reconnect_required')
    expect(caps.service_updates.unlock).toBe('reconnect_number')
  })

  it('keeps conversations readable but broadcasts closed when Meta restricted the account', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'blocked_by_meta', reasons: ['restricted'] }),
        guardOrg: guardOrg({ waAccountRestricted: true }),
      })
    )
    expect(caps.conversations.status).toBe('limited')
    expect(caps.conversations.reason).toBe('blocked_by_meta')
    expect(caps.service_updates.status).toBe('locked')
    expect(caps.service_updates.reason).toBe('blocked_by_meta')
    expect(caps.service_updates.unlock).toBe('wait_meta')
  })

  it('pauses broadcasts on quality RED and leaves conversations open', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'at_risk', reasons: ['quality_red'] }),
        guardOrg: guardOrg({ waQualityRating: 'RED' }),
      })
    )
    expect(caps.conversations.status).toBe('available')
    expect(caps.service_updates.reason).toBe('quality_red')
    expect(caps.promo_broadcasts.reason).toBe('quality_red')
  })

  it('names the support switch when broadcasts are disabled for the account', () => {
    const caps = computeWaCapabilities(healthy({ guardOrg: guardOrg({ broadcastsEnabled: false }) }))
    expect(caps.service_updates.reason).toBe('broadcasts_disabled')
    expect(caps.service_updates.unlock).toBe('ask_owner')
    expect(caps.lists.status).toBe('available')
  })
})

describe('computeWaCapabilities() — verification', () => {
  it('closes promos, and only promos, for an unverified business — with the Security Centre link', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'limited', reasons: ['unverified_business'], needsAction: true }),
        guardOrg: guardOrg({ waBusinessVerificationStatus: 'not_verified' }),
      })
    )
    expect(caps.service_updates.status).toBe('available')
    expect(caps.linked_groups.status).toBe('available')
    expect(caps.promo_broadcasts.status).toBe('locked')
    expect(caps.promo_broadcasts.reason).toBe('business_unverified')
    expect(caps.promo_broadcasts.unlock).toBe('verify_business')
    expect(caps.promo_broadcasts.unlockHref).toContain('business.facebook.com/settings/security')
  })

  it('prefers verification_pending over business_unverified while Meta is reviewing', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'limited', reasons: ['verification_pending'] }),
        guardOrg: guardOrg({ waBusinessVerificationStatus: 'pending' }),
      })
    )
    expect(caps.promo_broadcasts.reason).toBe('verification_pending')
    expect(caps.promo_broadcasts.unlock).toBe('wait_meta')
    expect(caps.promo_broadcasts.unlockHref).toBeNull()
  })
})

describe('computeWaCapabilities() — limits', () => {
  it('caps a new number at the warm-up cap with the date it opens', () => {
    const connectedAt = daysAgo(3)
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'limited', reasons: ['warm_up'] }),
        guardOrg: guardOrg({ waConnectedAt: connectedAt }),
      })
    )
    expect(caps.service_updates.status).toBe('limited')
    expect(caps.service_updates.reason).toBe('warm_up')
    expect(caps.service_updates.cap).toBe(WARM_UP_CAMPAIGN_CAP)
    expect(caps.service_updates.unlock).toBe('wait_until')
    expect(caps.service_updates.until).not.toBeNull()
    expect(new Date(caps.service_updates.until!).getTime()).toBe(
      new Date(connectedAt).getTime() + 14 * 86_400_000
    )
    // The group card inherits the same verdict.
    expect(caps.linked_groups.reason).toBe('warm_up')
    expect(caps.linked_groups.cap).toBe(WARM_UP_CAMPAIGN_CAP)
  })

  it('says unproven_tier, with no date, when the number is old but the tier is still low', () => {
    const caps = computeWaCapabilities(healthy({ guardOrg: guardOrg({ waMessagingLimitTier: 'TIER_250' }) }))
    expect(caps.service_updates.reason).toBe('unproven_tier')
    expect(caps.service_updates.until).toBeNull()
    expect(caps.service_updates.cap).toBe(WARM_UP_CAMPAIGN_CAP)
    expect(caps.service_updates.unlock).toBe('wait_meta')
  })

  it('caps at the yellow cap when quality dipped', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({ state: 'limited', reasons: ['quality_yellow'], needsAction: true }),
        guardOrg: guardOrg({ waQualityRating: 'YELLOW' }),
      })
    )
    expect(caps.service_updates.reason).toBe('quality_yellow')
    expect(caps.service_updates.cap).toBe(YELLOW_CAMPAIGN_CAP)
  })

  it('ignores the daily budget unless the caller counted today', () => {
    const spent = guardOrg({ waMessagingLimitTier: 'TIER_250' })
    const withoutCount = computeWaCapabilities(healthy({ guardOrg: spent }))
    expect(withoutCount.service_updates.reasons).not.toContain('capped_by_budget')
    expect(withoutCount.service_updates.reason).toBe('unproven_tier')

    const withCount = computeWaCapabilities(healthy({ guardOrg: spent, conversationsLast24h: 200 }))
    expect(withCount.service_updates.reasons).toContain('capped_by_budget')
    expect(withCount.service_updates.cap).toBe(25)

    const allSpent = computeWaCapabilities(healthy({ guardOrg: spent, conversationsLast24h: 250 }))
    expect(allSpent.service_updates.status).toBe('locked')
    expect(allSpent.service_updates.reason).toBe('no_daily_budget')
    expect(allSpent.service_updates.until).not.toBeNull()
  })

  it('notes unapproved templates on service updates only, and the group card drops it', () => {
    const caps = computeWaCapabilities(
      healthy({ connection: activeConnection({ state: 'limited', reasons: ['templates_unapproved'] }) })
    )
    expect(caps.service_updates.status).toBe('limited')
    expect(caps.service_updates.reason).toBe('templates_unapproved')
    expect(caps.service_updates.unlockHref).toBe('/settings/message-templates')
    expect(caps.promo_broadcasts.status).toBe('available')
    expect(caps.linked_groups.status).toBe('available')
  })

  it('mentions a Meta outage without locking anything', () => {
    const caps = computeWaCapabilities(
      healthy({ connection: activeConnection({ state: 'limited', reasons: ['unreachable'] }) })
    )
    expect(caps.conversations.status).toBe('limited')
    expect(caps.conversations.reason).toBe('unreachable')
    expect(caps.conversations.unlock).toBe('none')
    expect(caps.service_updates.status).toBe('limited')
    expect(caps.service_updates.cap).toBeNull()
  })

  it('lists every reason worst first when several apply', () => {
    const caps = computeWaCapabilities(
      healthy({
        connection: activeConnection({
          state: 'limited',
          reasons: ['quality_yellow', 'warm_up', 'unverified_business'],
        }),
        guardOrg: guardOrg({
          waQualityRating: 'YELLOW',
          waConnectedAt: daysAgo(2),
          waBusinessVerificationStatus: 'not_verified',
        }),
      })
    )
    expect(caps.service_updates.reasons).toEqual(['quality_yellow', 'warm_up'])
    expect(caps.service_updates.cap).toBe(WARM_UP_CAMPAIGN_CAP)
    expect(caps.promo_broadcasts.reason).toBe('business_unverified')
  })
})

describe('toLockedInfo() / formatUntil()', () => {
  it('turns the ISO date into the day a person reads, in the org zone', () => {
    // 21:30 UTC on the 27th is already the 28th in Jerusalem.
    expect(formatUntil('2026-09-27T21:30:00Z', 'Asia/Jerusalem', 'he')).toBe('28.09')
    expect(formatUntil(null, 'Asia/Jerusalem', 'he')).toBeNull()
  })

  it('keeps only what the client needs', () => {
    const caps = computeWaCapabilities(
      healthy({ guardOrg: guardOrg({ waConnectedAt: '2026-09-12T10:00:00Z' }) })
    )
    const info = toLockedInfo(caps.service_updates, 'Asia/Jerusalem', 'he')
    expect(info).toEqual({
      key: 'service_updates',
      status: 'limited',
      reason: 'warm_up',
      unlock: 'wait_until',
      unlockHref: null,
      cap: WARM_UP_CAMPAIGN_CAP,
      untilLabel: '26.09',
    })
  })
})

describe('whatsappCapability copy', () => {
  const ROOT = path.resolve(__dirname, '../../..')
  const load = (locale: string) =>
    JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8')) as {
      whatsappCapability: Record<string, Record<string, string> | string>
    }

  // messages.test.ts skips dynamic keys, so the reason tables are pinned here.
  for (const locale of ['he', 'en']) {
    it(`has title, body, unlock, howYouKnow and strip for every reason (${locale})`, () => {
      const copy = load(locale).whatsappCapability
      for (const reason of ALL_CAPABILITY_REASONS) {
        const entry = copy[reason] as Record<string, string> | undefined
        for (const field of ['title', 'body', 'unlock', 'howYouKnow', 'strip']) {
          expect(typeof entry?.[field], `${locale}: whatsappCapability.${reason}.${field}`).toBe('string')
        }
      }
    })

    it(`has a CTA label for every unlock (${locale})`, () => {
      const cta = load(locale).whatsappCapability.cta as Record<string, string>
      for (const unlock of ALL_UNLOCKS) {
        expect(typeof cta[unlock], `${locale}: whatsappCapability.cta.${unlock}`).toBe('string')
      }
    })
  }
})
