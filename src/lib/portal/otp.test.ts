import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  countRecentOtpRequests,
  generateOtp,
  hashOtp,
  MAX_FAILED_ATTEMPTS,
  verifyOtp,
} from './otp'

/**
 * Records the filters applied to a `select(..., { head: true })` count query so a
 * test can assert which rows the rate limiter actually counts.
 */
function makeCountClient(count: number) {
  const filters: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {}

  const chain = (key: string) =>
    vi.fn((column: string, value: unknown) => {
      filters[`${key}:${column}`] = value
      return builder
    })

  Object.assign(builder, {
    eq: chain('eq'),
    gte: chain('gte'),
    or: vi.fn((expr: string) => {
      filters['or'] = expr
      return builder
    }),
    then: (resolve: (v: { count: number; error: null }) => unknown) =>
      resolve({ count, error: null }),
  })

  const select = vi.fn(() => builder)
  return { client: { from: vi.fn(() => ({ select })) }, filters }
}

describe('generateOtp', () => {
  it('always returns 6 digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/)
    }
  })
})

describe('hashOtp', () => {
  it('is deterministic and does not leak the code', async () => {
    const hash = await hashOtp('123456')
    expect(hash).toBe(await hashOtp('123456'))
    expect(hash).not.toContain('123456')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(await hashOtp('123457'))
  })
})

describe('countRecentOtpRequests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not spend the quota on a code redeemed by a successful login', async () => {
    const db = makeCountClient(0)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const count = await countRecentOtpRequests('+972500000000', 'org-1')

    // A redeemed code is used=true with failed_attempts below the cap, so neither
    // arm of the OR matches it. Counting successes locked a parent out after three
    // logins in a quarter hour.
    expect(db.filters['or']).toContain('used.eq.false')
    expect(db.filters['eq:phone']).toBe('+972500000000')
    expect(db.filters['eq:organization_id']).toBe('org-1')
    expect(db.filters['gte:created_at']).toBeTypeOf('string')
    expect(count).toBe(0)
  })

  it('still counts a code burned by failed guesses, so the limit cannot be reset', async () => {
    const db = makeCountClient(3)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await countRecentOtpRequests('+972500000000', 'org-1')

    // The bypass this closes: request a code, spend MAX_FAILED_ATTEMPTS wrong
    // guesses to flip it to used=true, and a used-only filter read the window
    // empty again — unlimited OTP sends to any parent's phone and an unlimited
    // supply of codes to brute-force. Burned codes must stay counted.
    expect(db.filters['or']).toBe(`used.eq.false,failed_attempts.gte.${MAX_FAILED_ATTEMPTS}`)
    expect(db.filters['eq:used']).toBeUndefined()
  })

  it('scopes the window to the requested number of minutes', async () => {
    const db = makeCountClient(2)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const before = Date.now()
    const count = await countRecentOtpRequests('+972500000000', 'org-1', 15)
    const after = Date.now()

    // The implementation reads its own Date.now() somewhere between `before`
    // and `after`, so the cutoff is only bounded by those two. Comparing the
    // lower bound against `before` made this pass only when both clock reads
    // happened to land in the same millisecond.
    const since = new Date(db.filters['gte:created_at'] as string).getTime()
    expect(after - since).toBeGreaterThanOrEqual(15 * 60 * 1000)
    expect(before - since).toBeLessThanOrEqual(15 * 60 * 1000)
    expect(after - since).toBeLessThan(15 * 60 * 1000 + 5_000)
    expect(count).toBe(2)
  })
})

/** Minimal stand-in for the select/update chain `verifyOtp` drives. */
function makeVerifyClient(record: {
  id: string
  otp_hash: string
  failed_attempts: number
} | null) {
  const updates: Array<Record<string, unknown>> = []

  const selectBuilder: Record<string, unknown> = {}
  Object.assign(selectBuilder, {
    eq: vi.fn(() => selectBuilder),
    gt: vi.fn(() => selectBuilder),
    order: vi.fn(() => selectBuilder),
    limit: vi.fn(() => selectBuilder),
    maybeSingle: vi.fn().mockResolvedValue({ data: record, error: null }),
  })

  const update = vi.fn((patch: Record<string, unknown>) => {
    updates.push(patch)
    return { eq: vi.fn().mockResolvedValue({ error: null }) }
  })

  return {
    client: { from: vi.fn(() => ({ select: vi.fn(() => selectBuilder), update })) },
    updates,
  }
}

describe('verifyOtp', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts the right code and marks it single-use', async () => {
    const db = makeVerifyClient({
      id: 'otp-1',
      otp_hash: await hashOtp('123456'),
      failed_attempts: 0,
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const ok = await verifyOtp({ phone: '+972500000000', orgId: 'org-1', otp: '123456' })

    expect(ok).toBe(true)
    expect(db.updates).toEqual([{ used: true }])
  })

  it('rejects a wrong code and counts the attempt', async () => {
    const db = makeVerifyClient({
      id: 'otp-1',
      otp_hash: await hashOtp('123456'),
      failed_attempts: 1,
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const ok = await verifyOtp({ phone: '+972500000000', orgId: 'org-1', otp: '999999' })

    expect(ok).toBe(false)
    expect(db.updates).toEqual([{ failed_attempts: 2 }])
  })

  it('locks the code once the 5th guess fails', async () => {
    const db = makeVerifyClient({
      id: 'otp-1',
      otp_hash: await hashOtp('123456'),
      failed_attempts: 4,
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const ok = await verifyOtp({ phone: '+972500000000', orgId: 'org-1', otp: '999999' })

    expect(ok).toBe(false)
    expect(db.updates).toEqual([{ failed_attempts: 5, used: true }])
  })

  it('refuses a code that already hit the attempt limit, even if now correct', async () => {
    const db = makeVerifyClient({
      id: 'otp-1',
      otp_hash: await hashOtp('123456'),
      failed_attempts: 5,
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const ok = await verifyOtp({ phone: '+972500000000', orgId: 'org-1', otp: '123456' })

    expect(ok).toBe(false)
    expect(db.updates).toEqual([{ used: true }])
  })

  it('returns false when there is no active code', async () => {
    const db = makeVerifyClient(null)
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const ok = await verifyOtp({ phone: '+972500000000', orgId: 'org-1', otp: '123456' })

    expect(ok).toBe(false)
    expect(db.updates).toEqual([])
  })
})
