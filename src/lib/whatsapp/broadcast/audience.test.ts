/**
 * The consent rules, as a table.
 *
 * Every case here is a way a broadcast could reach somebody it must not. The
 * cost of getting one wrong is not a bug report — it is a block, a report to
 * Meta, and a quality rating the org cannot buy back.
 */

import { describe, it, expect } from 'vitest'
import { applyConsent } from './audience'
import type { AudienceCandidate } from './types'

const T = '2026-09-01T10:00:00Z'

function candidate(over: Partial<AudienceCandidate> = {}): AudienceCandidate {
  return {
    parentId: 'p1',
    studentId: 's1',
    phone: '972501111111',
    displayName: 'מיכל',
    locale: 'he',
    isActive: true,
    optedOutAt: null,
    updatesOptedOutAt: null,
    marketingOptInAt: null,
    marketingOptedOutAt: null,
    ...over,
  }
}

const reasons = (r: ReturnType<typeof applyConsent>) => r.skipped.map((s) => s.reason).sort()

describe('applyConsent: the hard block', () => {
  it('refuses an opted-out parent in every category', () => {
    for (const category of ['update', 'promo', 'invite'] as const) {
      const result = applyConsent([candidate({ optedOutAt: T, marketingOptInAt: T })], category)
      expect(result.included, category).toEqual([])
      expect(reasons(result), category).toEqual(['opted_out'])
    }
  })

  it('skips a candidate with no phone rather than sending nowhere', () => {
    const result = applyConsent([candidate({ phone: null }), candidate({ phone: '   ' })], 'update')
    expect(result.included).toEqual([])
    expect(result.skipped).toEqual([{ reason: 'no_phone', count: 2 }])
  })

  it('drops an archived parent silently — not a policy skip', () => {
    const result = applyConsent([candidate({ isActive: false })], 'update')
    expect(result.included).toEqual([])
    expect(result.skipped).toEqual([])
  })
})

describe('applyConsent: opting out of one category keeps the others', () => {
  it('a parent who stopped updates still receives promos they opted into', () => {
    const c = candidate({ updatesOptedOutAt: T, marketingOptInAt: T })

    expect(applyConsent([c], 'update').included).toEqual([])
    expect(reasons(applyConsent([c], 'update'))).toEqual(['updates_opted_out'])
    expect(applyConsent([c], 'promo').included).toHaveLength(1)
  })

  it('a parent who stopped promos still receives service updates', () => {
    const c = candidate({ marketingOptedOutAt: T, marketingOptInAt: T })

    expect(applyConsent([c], 'promo').included).toEqual([])
    expect(reasons(applyConsent([c], 'promo'))).toEqual(['marketing_opted_out'])
    expect(applyConsent([c], 'update').included).toHaveLength(1)
  })

  it('an invite follows the update rules', () => {
    const c = candidate({ updatesOptedOutAt: T })
    expect(reasons(applyConsent([c], 'invite'))).toEqual(['updates_opted_out'])
  })
})

describe('applyConsent: marketing needs a yes, not the absence of a no', () => {
  it('skips a parent who never opted in, even with nothing against them', () => {
    const result = applyConsent([candidate()], 'promo')
    expect(result.included).toEqual([])
    expect(reasons(result)).toEqual(['no_marketing_opt_in'])
  })

  it('includes a parent who did opt in', () => {
    const result = applyConsent([candidate({ marketingOptInAt: T })], 'promo')
    expect(result.included).toHaveLength(1)
    expect(result.skipped).toEqual([])
  })

  it('does not require an opt-in for a service update', () => {
    expect(applyConsent([candidate()], 'update').included).toHaveLength(1)
  })
})

describe('applyConsent: one person, one message', () => {
  it('dedupes a parent of two students in the same audience', () => {
    const result = applyConsent(
      [
        candidate({ studentId: 's1' }),
        candidate({ studentId: 's2' }),
        candidate({ studentId: 's3' }),
      ],
      'update'
    )
    expect(result.included).toHaveLength(1)
    expect(result.included[0].studentId).toBe('s1')
  })

  it('counts a repeated refusal once', () => {
    const result = applyConsent(
      [candidate({ optedOutAt: T }), candidate({ optedOutAt: T })],
      'update'
    )
    expect(result.skipped).toEqual([{ reason: 'opted_out', count: 1 }])
  })

  it('lets the parent row decide when a student shares their number', () => {
    // The student candidate carries no consent columns of its own, so if it won
    // the dedup an opted-out parent would be messaged on the same handset.
    const parent = candidate({ parentId: 'p1', optedOutAt: T })
    const student = candidate({ parentId: null, studentId: 's1', optedOutAt: null })
    const result = applyConsent([parent, student], 'update')

    expect(result.included).toEqual([])
    expect(reasons(result)).toEqual(['opted_out'])
  })
})

describe('applyConsent: group invites', () => {
  it('skips a parent who was already invited', () => {
    const result = applyConsent([candidate({ alreadyInvited: true })], 'invite')
    expect(result.included).toEqual([])
    expect(reasons(result)).toEqual(['already_invited'])
  })

  it('invites only the parent who has not had one', () => {
    const result = applyConsent(
      [
        candidate({ parentId: 'p1', phone: '972501111111', alreadyInvited: true }),
        candidate({ parentId: 'p2', phone: '972502222222', alreadyInvited: false }),
      ],
      'invite'
    )
    expect(result.included.map((r) => r.parentId)).toEqual(['p2'])
  })

  it('ignores the invite flag for other categories', () => {
    expect(applyConsent([candidate({ alreadyInvited: true })], 'update').included).toHaveLength(1)
  })
})

describe('applyConsent: locale', () => {
  it("uses the parent's language, and the org default when they have none", () => {
    const result = applyConsent(
      [
        candidate({ parentId: 'p1', phone: '9725011', locale: 'en' }),
        candidate({ parentId: 'p2', phone: '9725022', locale: null }),
      ],
      'update',
      'he'
    )
    expect(result.included.map((r) => r.locale)).toEqual(['en', 'he'])
  })
})
