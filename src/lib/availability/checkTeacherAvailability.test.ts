import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => mockFrom(table),
  }),
}))

import { checkTeacherAvailability } from './checkTeacherAvailability'

type RowsFor = {
  organizations?: { timezone: string } | null
  override?: {
    is_available: boolean
    start_time: string | null
    end_time: string | null
    reason: string | null
  } | null
  availability?: Array<{ start_time: string; end_time: string }>
  /** Keyed by day_of_week, so a test can prove the weekday mapping. */
  availabilityByDay?: Record<number, Array<{ start_time: string; end_time: string }>>
}

/** The day_of_week the availability query actually asked for. */
let requestedDay: number | null = null

function setupClient(rows: RowsFor) {
  requestedDay = null
  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: rows.organizations ?? null }),
          }),
        }),
      }
    }
    if (table === 'availability_overrides') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: rows.override ?? null }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'availability') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              // Honours the day filter — otherwise a regression in the
              // weekday mapping would sail past every case below.
              eq: async (_column: string, day: number) => {
                requestedDay = day
                return {
                  data: rows.availabilityByDay
                    ? (rows.availabilityByDay[day] ?? [])
                    : (rows.availability ?? []),
                }
              },
            }),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

const BASE = {
  orgId: 'org-1',
  teacherId: 'teacher-1',
  date: '2026-05-13', // Wednesday
  startTime: '10:00',
  durationMinutes: 60,
}

describe('checkTeacherAvailability', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns inside when the slot fits inside a recurring weekly window', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availability: [{ start_time: '09:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('inside')
  })

  it('returns outside_windows when the slot is on a known weekday but outside windows', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availability: [{ start_time: '13:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('outside_windows')
  })

  it('returns no_windows when the teacher has no recurring availability for that weekday', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availability: [],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('no_windows')
  })

  it('respects a date-specific override marking the day unavailable', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: {
        is_available: false,
        start_time: null,
        end_time: null,
        reason: 'vacation',
      },
      availability: [{ start_time: '09:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('override_unavailable')
    if (result.status === 'override_unavailable') {
      expect(result.reason).toBe('vacation')
    }
  })

  it('uses the override window when the override marks the day available with bounds', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: {
        is_available: true,
        start_time: '08:00',
        end_time: '12:00',
        reason: null,
      },
      availability: [],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('inside')
  })

  it('flags partial_override when slot is outside the override window', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: {
        is_available: true,
        start_time: '14:00',
        end_time: '18:00',
        reason: 'shortened day',
      },
      availability: [{ start_time: '09:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('partial_override')
  })
it('asks for the org-local weekday, not the Luxon one', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      // Wednesday is 3 under the DB's 0=Sunday convention; Luxon calls it 3 too,
      // but Sunday is where the two diverge — covered below.
      availabilityByDay: { 3: [{ start_time: '09:00', end_time: '17:00' }] },
    })

    const result = await checkTeacherAvailability(BASE)
    expect(requestedDay).toBe(3)
    expect(result.status).toBe('inside')
  })

  it(`maps Sunday to 0 rather than Luxon's 7`, async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availabilityByDay: { 0: [{ start_time: '09:00', end_time: '17:00' }] },
    })

    // 2026-05-17 is a Sunday.
    const result = await checkTeacherAvailability({ ...BASE, date: '2026-05-17' })
    expect(requestedDay).toBe(0)
    expect(result.status).toBe('inside')
  })

  it('reports the windows it collided with, normalized and sorted', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availability: [
        { start_time: '18:00:00', end_time: '20:00:00' },
        { start_time: '13:00:00', end_time: '17:00:00' },
      ],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('outside_windows')
    if (result.status !== 'outside_windows') return
    expect(result.dayOfWeek).toBe(3)
    expect(result.source).toBe('weekly')
    // Postgres hands back HH:MM:SS; the dialog must not print seconds.
    expect(result.windows).toEqual([
      { start: '13:00', end: '17:00' },
      { start: '18:00', end: '20:00' },
    ])
  })

  it('reports an empty window list for a weekday with no availability', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: null,
      availability: [],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('no_windows')
    if (result.status !== 'no_windows') return
    expect(result.dayOfWeek).toBe(3)
    expect(result.windows).toEqual([])
  })

  it('reports the override bounds on partial_override', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: {
        is_available: true,
        start_time: '14:00:00',
        end_time: '18:00:00',
        reason: 'shortened day',
      },
      availability: [{ start_time: '09:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('partial_override')
    if (result.status !== 'partial_override') return
    expect(result.source).toBe('override')
    expect(result.reason).toBe('shortened day')
    expect(result.windows).toEqual([{ start: '14:00', end: '18:00' }])
  })

  it('reports no windows but keeps the reason on override_unavailable', async () => {
    setupClient({
      organizations: { timezone: 'Asia/Jerusalem' },
      override: { is_available: false, start_time: null, end_time: null, reason: 'vacation' },
      availability: [{ start_time: '09:00', end_time: '17:00' }],
    })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('override_unavailable')
    if (result.status !== 'override_unavailable') return
    expect(result.source).toBe('override')
    expect(result.windows).toEqual([])
    expect(result.reason).toBe('vacation')
  })

  it('degrades to a silent no_windows when the org row is missing', async () => {
    setupClient({ organizations: null })

    const result = await checkTeacherAvailability(BASE)
    expect(result.status).toBe('no_windows')
    if (result.status !== 'no_windows') return
    expect(result.dayOfWeek).toBeNull()
    expect(result.windows).toEqual([])
  })
})

