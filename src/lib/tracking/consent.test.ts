import { describe, expect, it } from 'vitest'

import {
  allowsCategory,
  decodeConsent,
  encodeConsent,
  type ConsentDecision,
} from './consent'

const AT = '2026-08-31T10:00:00.000Z'

function decision(analytics: boolean, marketing: boolean): ConsentDecision {
  return { analytics, marketing, at: AT }
}

describe('consent encoding', () => {
  it('round-trips every combination', () => {
    for (const [a, m] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const d = decision(a, m)
      expect(decodeConsent(encodeConsent(d))).toEqual(d)
    }
  })

  it('treats an unreadable cookie as no decision, never as consent', () => {
    // The value is attacker-controllable and outlives format changes.
    for (const raw of [undefined, '', 'yes', '11', '2 1.x', 'true.true']) {
      expect(decodeConsent(raw)).toBeNull()
    }
  })
})

describe('allowsCategory', () => {
  it('always allows necessary', () => {
    expect(allowsCategory(null, 'necessary')).toBe(true)
    expect(allowsCategory(decision(false, false), 'necessary')).toBe(true)
  })

  it('denies everything else until the visitor answers', () => {
    // An unanswered banner is not consent.
    expect(allowsCategory(null, 'analytics')).toBe(false)
    expect(allowsCategory(null, 'marketing')).toBe(false)
  })

  it('honours a partial decision', () => {
    const analyticsOnly = decision(true, false)
    expect(allowsCategory(analyticsOnly, 'analytics')).toBe(true)
    expect(allowsCategory(analyticsOnly, 'marketing')).toBe(false)
  })

  it('honours a full refusal', () => {
    const refused = decision(false, false)
    expect(allowsCategory(refused, 'analytics')).toBe(false)
    expect(allowsCategory(refused, 'marketing')).toBe(false)
  })
})
