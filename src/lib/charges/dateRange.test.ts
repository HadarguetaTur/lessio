import { describe, expect, it } from 'vitest'
import { getChargeDateRange } from './dateRange'

describe('getChargeDateRange', () => {
  it('includes the full end date in the organization timezone', () => {
    expect(getChargeDateRange('2026-09-01', '2026-09-02', 'Asia/Jerusalem')).toEqual({
      fromInclusive: '2026-08-31T21:00:00.000Z',
      toExclusive: '2026-09-02T21:00:00.000Z',
    })
  })

  it('supports an open-ended range', () => {
    expect(getChargeDateRange(undefined, '2026-01-15', 'Asia/Jerusalem')).toEqual({
      fromInclusive: undefined,
      toExclusive: '2026-01-15T22:00:00.000Z',
    })
  })
})
