import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockGetAvailableSlots = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./getAvailableSlots', () => ({
  getAvailableSlots: (...args: unknown[]) => mockGetAvailableSlots(...args),
}))

import { getAvailabilitySummary, mergeSlotsIntoBands } from './getAvailabilitySummary'

describe('mergeSlotsIntoBands', () => {
  it('merges contiguous slots into a single visible band', () => {
    const result = mergeSlotsIntoBands([
      { startAt: '2026-03-22T10:00:00.000Z', endAt: '2026-03-22T10:45:00.000Z' },
      { startAt: '2026-03-22T10:45:00.000Z', endAt: '2026-03-22T11:30:00.000Z' },
      { startAt: '2026-03-22T12:00:00.000Z', endAt: '2026-03-22T12:45:00.000Z' },
    ])

    expect(result).toEqual([
      { startAt: '2026-03-22T10:00:00.000Z', endAt: '2026-03-22T11:30:00.000Z' },
      { startAt: '2026-03-22T12:00:00.000Z', endAt: '2026-03-22T12:45:00.000Z' },
    ])
  })
})

describe('getAvailabilitySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => buildChain({ data: { timezone: 'UTC' }, error: null }))
  })

  it('returns a 7-day summary and preserves the normalized week start', async () => {
    mockGetAvailableSlots
      .mockResolvedValueOnce([
        { startAt: '2026-03-22T10:00:00.000Z', endAt: '2026-03-22T10:45:00.000Z' },
        { startAt: '2026-03-22T10:45:00.000Z', endAt: '2026-03-22T11:30:00.000Z' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const summary = await getAvailabilitySummary({
      teacherId: 'teacher-1',
      organizationId: 'org-1',
      durationMinutes: 45,
      weekStart: '2026-03-24',
    })

    expect(summary.weekStart).toBe('2026-03-22')
    expect(summary.timezone).toBe('UTC')
    expect(summary.days).toHaveLength(7)
    expect(summary.days[0]).toEqual({
      date: '2026-03-22',
      hasAvailability: true,
      freeIntervals: [
        { startAt: '2026-03-22T10:00:00.000Z', endAt: '2026-03-22T11:30:00.000Z' },
      ],
    })
    expect(summary.days[1].hasAvailability).toBe(false)
    expect(mockGetAvailableSlots).toHaveBeenCalledTimes(7)
  })
})

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach((method) => {
    self[method] = pass
  })
  self['single'] = () => Promise.resolve(result)
  return self
}
