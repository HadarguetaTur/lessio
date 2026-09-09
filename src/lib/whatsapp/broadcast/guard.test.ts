/**
 * The guard, rule by rule.
 *
 * Each case is a way an org could lose its WhatsApp number: a campaign sent
 * while quality is already falling, a burst that eats the day's allowance and
 * leaves no room for lesson reminders, a promotion sent from an unverified
 * portfolio, or a message at 02:00.
 */

import { describe, it, expect } from 'vitest'
import {
  checkCampaignAllowed,
  classifyMetaError,
  dailyBudget,
  frequencySkip,
  nextSendableTime,
  WARM_UP_CAMPAIGN_CAP,
  YELLOW_CAMPAIGN_CAP,
  type GuardOrg,
} from './guard'

/** A healthy, verified, long-connected org sending in the middle of the day. */
function org(over: Partial<GuardOrg> = {}): GuardOrg {
  return {
    whatsappPhoneNumberId: 'pn-1',
    waHealthError: null,
    waAccountRestricted: false,
    waQualityRating: 'GREEN',
    waMessagingLimitTier: 'TIER_10K',
    waBusinessVerificationStatus: 'verified',
    waConnectedAt: '2026-01-01T00:00:00Z',
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

// 12:00 Jerusalem — inside the sending window all year.
const NOON = new Date('2026-09-09T09:00:00Z')

const allow = (over: Partial<Parameters<typeof checkCampaignAllowed>[0]> = {}) =>
  checkCampaignAllowed({
    org: org(),
    category: 'update',
    recipientCount: 40,
    conversationsLast24h: 0,
    now: NOON,
    ...over,
  })

describe('blocks that stop a campaign outright', () => {
  const cases: Array<[string, Partial<Parameters<typeof checkCampaignAllowed>[0]>, string]> = [
    ['no WhatsApp connected', { org: org({ whatsappPhoneNumberId: null }) }, 'not_connected'],
    ['a dead access token', { org: org({ waHealthError: 'token_invalid' }) }, 'reconnect_required'],
    ['an account Meta restricted', { org: org({ waAccountRestricted: true }) }, 'blocked_by_meta'],
    ['quality already RED', { org: org({ waQualityRating: 'RED' }) }, 'quality_red'],
    ['superadmin kill switch', { org: org({ broadcastsEnabled: false }) }, 'broadcasts_disabled'],
    ['lapsed subscription', { org: org({ subscriptionLapsed: true }) }, 'subscription_lapsed'],
    ['template Meta paused', { templatePaused: true }, 'template_paused'],
    [
      'promo from an unverified business',
      { category: 'promo' as const, org: org({ waBusinessVerificationStatus: 'not_verified' }) },
      'promo_needs_verification',
    ],
    [
      'a promotion dressed as a service update',
      { contentLooksPromotional: true },
      'promotional_content_in_update',
    ],
  ]

  for (const [name, input, reason] of cases) {
    it(name, () => {
      const decision = allow(input)
      expect(decision.ok).toBe(false)
      if (!decision.ok) expect(decision.reason).toBe(reason)
    })
  }

  it('lets a verified business send a promo', () => {
    expect(allow({ category: 'promo' }).ok).toBe(true)
  })

  it('does not apply the promotional-content check to a promo campaign', () => {
    expect(allow({ category: 'promo', contentLooksPromotional: true }).ok).toBe(true)
  })
})

describe('caps that shrink a campaign instead of refusing it', () => {
  it('YELLOW quality caps the audience and warns', () => {
    const d = allow({ org: org({ waQualityRating: 'YELLOW' }), recipientCount: 500 })
    expect(d.ok && d.cap).toBe(YELLOW_CAMPAIGN_CAP)
    expect(d.ok && d.warnings).toContain('quality_yellow')
  })

  it('a number connected days ago is capped as unproven', () => {
    const d = allow({
      org: org({ waConnectedAt: new Date(NOON.getTime() - 3 * 86400_000).toISOString() }),
      recipientCount: 500,
    })
    expect(d.ok && d.cap).toBe(WARM_UP_CAMPAIGN_CAP)
    expect(d.ok && d.warnings).toContain('warm_up')
  })

  it('the unverified 250 tier is capped even long after connecting', () => {
    const d = allow({ org: org({ waMessagingLimitTier: 'TIER_250' }), recipientCount: 500 })
    expect(d.ok && d.cap).toBe(WARM_UP_CAMPAIGN_CAP)
  })

  it('leaves half the remaining daily allowance for reminders', () => {
    // 2,000 tier, 1,000 already used → 1,000 left → 500 for this campaign.
    const d = allow({
      org: org({ waMessagingLimitTier: 'TIER_2K' }),
      conversationsLast24h: 1_000,
      recipientCount: 900,
    })
    expect(d.ok && d.cap).toBe(500)
    expect(d.ok && d.warnings).toContain('capped_by_budget')
  })

  it('refuses when the day is spent rather than sending one message', () => {
    const d = allow({
      org: org({ waMessagingLimitTier: 'TIER_2K' }),
      conversationsLast24h: 2_000,
      recipientCount: 10,
    })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.reason).toBe('no_daily_budget')
  })

  it('does not invent a cap when Meta has not told us the tier', () => {
    const d = allow({ org: org({ waMessagingLimitTier: null }), recipientCount: 300 })
    expect(d.ok && d.cap).toBe(300)
  })

  it('an audience smaller than every cap passes through untouched', () => {
    const d = allow({ recipientCount: 12 })
    expect(d.ok && d.cap).toBe(12)
    expect(d.ok && d.warnings).toEqual([])
  })
})

describe('dailyBudget', () => {
  it('is unlimited for an unlimited tier', () => {
    expect(dailyBudget(org({ waMessagingLimitTier: 'TIER_UNLIMITED' }), 5_000)).toBe(
      Number.POSITIVE_INFINITY
    )
  })

  it('never goes negative when the tier was lowered mid-day', () => {
    expect(dailyBudget(org({ waMessagingLimitTier: 'TIER_250' }), 900)).toBe(0)
  })
})

describe('quiet hours defer, they do not refuse', () => {
  it('is silent during the sending window', () => {
    expect(nextSendableTime(NOON, 'Asia/Jerusalem', 8, 21)).toBeNull()
  })

  it('moves a late-night campaign to the morning', () => {
    // 23:30 Jerusalem on 9 Sep → 08:00 on 10 Sep.
    const lateNight = new Date('2026-09-09T20:30:00Z')
    const when = nextSendableTime(lateNight, 'Asia/Jerusalem', 8, 21)
    expect(when).not.toBeNull()
    expect(when!.toISOString()).toBe('2026-09-10T05:00:00.000Z')
  })

  it('moves an early-morning campaign to later the same day', () => {
    // 05:00 Jerusalem → 08:00 the same morning.
    const dawn = new Date('2026-09-09T02:00:00Z')
    const when = nextSendableTime(dawn, 'Asia/Jerusalem', 8, 21)
    expect(when!.toISOString()).toBe('2026-09-09T05:00:00.000Z')
  })

  it('a deferred campaign is still allowed, with the time attached', () => {
    const d = allow({ now: new Date('2026-09-09T20:30:00Z') })
    expect(d.ok).toBe(true)
    expect(d.ok && d.deferUntil).not.toBeNull()
    expect(d.ok && d.warnings).toContain('outside_quiet_hours')
  })
})

describe('frequencySkip', () => {
  it('caps promos harder than updates', () => {
    const o = org()
    expect(frequencySkip(o, 'promo', 0)).toBeNull()
    expect(frequencySkip(o, 'promo', 1)).toBe('frequency_capped')
    expect(frequencySkip(o, 'update', 2)).toBeNull()
    expect(frequencySkip(o, 'update', 3)).toBe('frequency_capped')
  })

  it('honours an org that turned the category off entirely', () => {
    expect(frequencySkip(org({ maxPromoPerWeek: 0 }), 'promo', 0)).toBe('frequency_capped')
  })

  it('treats an invite as an update', () => {
    expect(frequencySkip(org(), 'invite', 3)).toBe('frequency_capped')
  })
})

describe('classifyMetaError', () => {
  it('treats the per-user marketing cap as a skip, never a retry', () => {
    const r = classifyMetaError(131049)
    expect(r).toMatchObject({ outcome: 'skipped', skipReason: 'per_user_limit', stopRun: false })
  })

  it('records a marketing opt-out reported by Meta', () => {
    const r = classifyMetaError(131050)
    expect(r).toMatchObject({ outcome: 'skipped', optOutMarketing: true })
  })

  it('requeues a rate-limited message and ends the tick', () => {
    for (const code of [130429, 131056, 80007]) {
      const r = classifyMetaError(code)
      expect(r.outcome, String(code)).toBe('retry')
      expect(r.stopRun, String(code)).toBe(true)
    }
  })

  it('fails anything else without stopping the run', () => {
    // 131047 = re-engagement outside the 24h window: this recipient's problem,
    // not the run's.
    const r = classifyMetaError(131047)
    expect(r).toMatchObject({ outcome: 'failed', stopRun: false })
    expect(classifyMetaError(null).outcome).toBe('failed')
  })
})

describe('a transient Meta outage is not a broken line', () => {
  it('lets a campaign run when the last health read merely timed out', () => {
    // 'unreachable' means we could not ask, not that the answer was bad. A slow
    // Graph read must not stop an announcement the owner already approved.
    const decision = checkCampaignAllowed({
      org: org({ waHealthError: 'unreachable' }),
      category: 'update',
      recipientCount: 20,
      conversationsLast24h: 0,
      now: NOON,
    })
    expect(decision.ok).toBe(true)
  })
})
