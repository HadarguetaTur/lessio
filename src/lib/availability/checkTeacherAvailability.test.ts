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
}

function setupClient(rows: RowsFor) {
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
              eq: async () => ({ data: rows.availability ?? [] }),
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
})
