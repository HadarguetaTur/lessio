import { describe, expect, it } from 'vitest'
import { getSeriesStopBoundary, isRemovableSeriesOccurrence } from './seriesStop'

describe('series stop rules', () => {
  it('turns an organization-local stop date into the correct UTC cutoff', () => {
    expect(getSeriesStopBoundary('2026-09-10', 'Asia/Jerusalem')).toEqual({
      cutoffUtc: '2026-09-09T21:00:00.000Z',
      until: '2026-09-09',
    })
  })

  it('removes planned and legacy series-cancelled rows only', () => {
    expect(isRemovableSeriesOccurrence({ status: 'scheduled', cancel_reason: null })).toBe(true)
    expect(isRemovableSeriesOccurrence({ status: 'cancelled', cancel_reason: 'SERIES_CANCELLED' })).toBe(true)
    expect(isRemovableSeriesOccurrence({ status: 'cancelled', cancel_reason: 'Parent asked' })).toBe(false)
    expect(isRemovableSeriesOccurrence({ status: 'completed', cancel_reason: null })).toBe(false)
    expect(isRemovableSeriesOccurrence({ status: 'no_show', cancel_reason: null })).toBe(false)
  })
})
