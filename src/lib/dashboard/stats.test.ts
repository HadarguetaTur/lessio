import { describe, it, expect } from 'vitest'
import { computeTrend, computeCancellationRate, sumAmounts } from './stats'

const NOW = '2026-08-15T12:00:00.000Z'

function lesson(status: string, start_at: string) {
  return { status, start_at }
}

describe('computeCancellationRate', () => {
  it('returns zero when every lesson is still in the future', () => {
    const lessons = [
      lesson('scheduled', '2026-08-20T10:00:00.000Z'),
      lesson('scheduled', '2026-08-25T10:00:00.000Z'),
    ]
    expect(computeCancellationRate(lessons, NOW)).toEqual({ rate: 0, cancelled: 0, elapsed: 0 })
  })

  it('only divides by lessons that already started — future lessons no longer dilute the rate', () => {
    const lessons = [
      // Past: 2 cancelled + 2 completed → 50%
      lesson('cancelled', '2026-08-01T10:00:00.000Z'),
      lesson('cancelled', '2026-08-02T10:00:00.000Z'),
      lesson('completed', '2026-08-03T10:00:00.000Z'),
      lesson('completed', '2026-08-04T10:00:00.000Z'),
      // Future: 6 scheduled — the old code counted these and reported 20%
      ...Array.from({ length: 6 }, (_, i) => lesson('scheduled', `2026-08-2${i}T10:00:00.000Z`)),
    ]
    expect(computeCancellationRate(lessons, NOW)).toEqual({ rate: 50, cancelled: 2, elapsed: 4 })
  })

  it('counts a lesson starting exactly at now as elapsed', () => {
    const lessons = [lesson('cancelled', NOW)]
    expect(computeCancellationRate(lessons, NOW)).toEqual({ rate: 100, cancelled: 1, elapsed: 1 })
  })

  it('handles no_show and completed past lessons in the denominator', () => {
    const lessons = [
      lesson('no_show', '2026-08-01T10:00:00.000Z'),
      lesson('completed', '2026-08-02T10:00:00.000Z'),
      lesson('scheduled', '2026-08-03T10:00:00.000Z'), // past but still marked scheduled
      lesson('cancelled', '2026-08-04T10:00:00.000Z'),
    ]
    expect(computeCancellationRate(lessons, NOW)).toEqual({ rate: 25, cancelled: 1, elapsed: 4 })
  })

  it('returns zero (not NaN) for empty input', () => {
    expect(computeCancellationRate([], NOW)).toEqual({ rate: 0, cancelled: 0, elapsed: 0 })
  })
})

describe('computeTrend', () => {
  it('is neutral when both are zero', () => {
    expect(computeTrend(0, 0)).toEqual({ direction: 'neutral', label: '—' })
  })

  it('is +100% when rising from zero', () => {
    expect(computeTrend(5, 0)).toEqual({ direction: 'up', label: '+100%' })
  })

  it('reports a drop as a negative percentage', () => {
    expect(computeTrend(90, 100)).toEqual({ direction: 'down', label: '-10%' })
  })

  it('is neutral when unchanged', () => {
    expect(computeTrend(100, 100)).toEqual({ direction: 'neutral', label: '—' })
  })

  it('rounds to whole percent', () => {
    expect(computeTrend(106, 100)).toEqual({ direction: 'up', label: '+6%' })
    expect(computeTrend(100.4, 100)).toEqual({ direction: 'neutral', label: '—' })
  })
})

describe('sumAmounts', () => {
  it('sums numeric and string amounts', () => {
    expect(sumAmounts([{ amount: 100 }, { amount: '50.5' }])).toBe(150.5)
  })

  it('returns 0 for null or empty input', () => {
    expect(sumAmounts(null)).toBe(0)
    expect(sumAmounts([])).toBe(0)
  })
})
