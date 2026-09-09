import { describe, it, expect } from 'vitest'
import { isInWarmUp, tierDailyLimit, WARM_UP_DAYS } from './health'

describe('tierDailyLimit()', () => {
  it('maps Meta tier labels to conversations per 24h', () => {
    expect(tierDailyLimit('TIER_250')).toBe(250)
    expect(tierDailyLimit('tier_2k')).toBe(2_000)
    expect(tierDailyLimit('TIER_10K')).toBe(10_000)
    expect(tierDailyLimit('TIER_100K')).toBe(100_000)
    expect(tierDailyLimit('TIER_UNLIMITED')).toBe(Number.POSITIVE_INFINITY)
  })

  it('answers null for an unknown or missing tier', () => {
    expect(tierDailyLimit(null)).toBeNull()
    expect(tierDailyLimit(undefined)).toBeNull()
    expect(tierDailyLimit('TIER_SOMETHING_NEW')).toBeNull()
  })
})

describe('isInWarmUp()', () => {
  const now = new Date('2026-09-08T10:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

  it('is true inside the warm-up window and false after it', () => {
    expect(isInWarmUp(daysAgo(1), now)).toBe(true)
    expect(isInWarmUp(daysAgo(WARM_UP_DAYS - 1), now)).toBe(true)
    expect(isInWarmUp(daysAgo(WARM_UP_DAYS), now)).toBe(false)
    expect(isInWarmUp(daysAgo(60), now)).toBe(false)
  })

  it('treats an unknown connection date as out of warm-up', () => {
    // Orgs connected before the column existed are backfilled; a null here
    // means "long ago", and must not lock them into the warm-up caps.
    expect(isInWarmUp(null, now)).toBe(false)
    expect(isInWarmUp(undefined, now)).toBe(false)
  })
})
