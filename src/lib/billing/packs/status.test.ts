import { describe, expect, it } from 'vitest'
import { isPackRunningLow, packStatus } from './status'

const base = { cancelled_at: null, activated_at: '2026-09-01T10:00:00Z', valid_until: null, remaining: 5 }

describe('packStatus', () => {
  it.each([
    [{ ...base, cancelled_at: '2026-09-02T00:00:00Z', activated_at: null }, 'cancelled'],
    [{ ...base, activated_at: null, remaining: 0 }, 'pending_payment'],
    [{ ...base, valid_until: '2026-09-14', remaining: 3 }, 'expired'],
    [{ ...base, remaining: 0 }, 'exhausted'],
    [{ ...base, valid_until: '2026-09-15' }, 'active'],
  ] as const)('%o → %s', (pack, expected) => {
    expect(packStatus(pack, '2026-09-15')).toBe(expected)
  })
})

describe('isPackRunningLow', () => {
  it('is true only for an active pack at or under the threshold', () => {
    expect(isPackRunningLow({ ...base, remaining: 2 }, '2026-09-15', 2)).toBe(true)
    expect(isPackRunningLow({ ...base, remaining: 3 }, '2026-09-15', 2)).toBe(false)
    expect(isPackRunningLow({ ...base, remaining: 0 }, '2026-09-15', 2)).toBe(false)
  })
})
