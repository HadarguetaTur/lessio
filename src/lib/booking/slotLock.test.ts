import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSlotLock, SlotUnavailableError } from './createSlotLock'
import { validateSlotLock } from './validateSlotLock'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockInsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// Google Calendar re-check at lock time (decision #36) — defaults to no busy.
const mockExternalBusy = vi.fn().mockResolvedValue([])
vi.mock('@/lib/google-calendar/getExternalBusyIntervals', () => ({
  getExternalBusyIntervals: (...args: unknown[]) => mockExternalBusy(...args),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
// A future instant: createSlotLock now refuses a slot already behind us, so a
// hard-coded past date would make every case here pass on the wrong assertion.
// 16:00Z is 18:00 in Asia/Jerusalem on this date (still UTC+2 — DST starts on
// the 26th), which is what the availability fixture below has to cover.
const START = '2027-03-23T16:00:00.000Z'
const END = '2027-03-23T17:00:00.000Z'
const LOCK_ID = 'lock-1'

/** A future expiry — lock is still valid */
const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString()
/** A past expiry — lock is expired */
const pastExpiry = new Date(Date.now() - 1000).toISOString()

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'in', 'order', 'limit', 'insert', 'update'].forEach(m => { self[m] = pass })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
}

/** The two rows the effective break is resolved from. */
function breakRows(orgBreak: number, teacherBreak: number | null) {
  return {
    organizations: buildChain({ data: { break_duration_minutes: orgBreak }, error: null }),
    teachers: buildChain({ data: { break_duration_minutes: teacherBreak }, error: null }),
  }
}

/**
 * What a bookable slot looks like to assertSlotBookable: an open weekly window
 * around the slot, no override, no holiday.
 *
 * Every case below routes its unmatched tables through here, because the
 * write-time validator now asks these questions before anything else runs —
 * without them each test would pass on 'outside_availability' rather than on
 * the collision it means to prove.
 */
function fallback(table: string) {
  if (table === 'availability') {
    return buildChain({ data: [{ start_time: '08:00:00', end_time: '22:00:00' }], error: null })
  }
  if (table === 'organization_holidays') return buildChain({ data: null, error: null })
  // An object, not a list: the org row is read with .single() for the timezone,
  // the notice horizon and the duration whitelist. An empty array there reads as
  // "no allowed durations" and rejects every slot for the wrong reason.
  if (table === 'organizations') {
    return buildChain({ data: { break_duration_minutes: 0 }, error: null })
  }
  return buildChain({ data: [], error: null })
}

// ── createSlotLock tests ──────────────────────────────────────────────────────

describe('createSlotLock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a lock when the slot is available', async () => {
    const createdLock = {
      id: LOCK_ID, teacher_id: TEACHER_ID, student_id: null,
      start_at: START, end_at: END,
      expires_at: futureExpiry, status: 'active',
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: [], error: null })
      if (table === 'slot_locks') {
        const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
        // Insert path returns the created lock
        chain['insert'] = () => ({
          ...buildChain({ data: createdLock, error: null }),
          select: () => buildChain({ data: createdLock, error: null }),
        })
        return chain
      }
      return fallback(table)
    })

    const lock = await createSlotLock({
      teacherId: TEACHER_ID,
      startAt: START,
      endAt: END,
      organizationId: ORG_ID,
    })

    expect(lock.id).toBe(LOCK_ID)
    expect(lock.status).toBe('active')
  })

  it('throws SlotUnavailableError when a lesson already occupies the slot', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return buildChain({
          data: [{ id: 'lesson-1' }],
          error: null,
        })
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  it('throws SlotUnavailableError when the day was blocked after listing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'availability_overrides') {
        return buildChain({
          data: [{ is_available: false, start_time: null, end_time: null, reason: 'חופשה' }],
          error: null,
        })
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  it('throws SlotUnavailableError when blocked hours cover the slot', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'availability_overrides') {
        return buildChain({
          data: [{ is_available: false, start_time: '12:00', end_time: '22:00', reason: null }],
          error: null,
        })
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  it('throws SlotUnavailableError when Google Calendar reports the slot busy', async () => {
    mockFrom.mockImplementation((table: string) => fallback(table))
    mockExternalBusy.mockResolvedValueOnce([{ start: START, end: END }])

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
    expect(mockExternalBusy).toHaveBeenCalledWith({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      windowStartUtc: START,
      windowEndUtc: END,
    })
  })

  it('throws SlotUnavailableError when an active slot lock already exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: [], error: null })
      if (table === 'slot_locks') {
        return buildChain({ data: [{ id: 'existing-lock' }], error: null })
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  it('throws SlotUnavailableError on unique-constraint violation (concurrent lock race)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: [], error: null })
      if (table === 'slot_locks') {
        const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
        // Availability check passes (empty), but insert fails with 23505
        let callCount = 0
        chain['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
          callCount++
          // First two awaits are the availability checks → return empty
          return Promise.resolve({ data: [], error: null }).then(res, rej)
        }
        chain['insert'] = () => ({
          select: () => buildChain({ data: null, error: { code: '23505', message: 'unique violation' } }),
        })
        return chain
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  // The lock path must apply the same break the generator did, or two parents
  // could take adjacent locks the calendar never offered together.
  it('rejects a slot that merely sits inside a lesson\'s break', async () => {
    const rows = breakRows(0, 30)
    let lessonQueryEnd: string | undefined

    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return rows.organizations
      if (table === 'teachers') return rows.teachers
      if (table === 'lessons') {
        // Capture the upper bound so we can assert it was widened, then answer
        // as if a lesson ends right where the buffer begins.
        const chain = buildChain({ data: [{ id: 'lesson-1' }], error: null }) as Record<string, unknown>
        chain['lt'] = (_col: string, value: string) => {
          lessonQueryEnd = value
          return chain
        }
        return chain
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)

    // 17:00 end + 30-minute break
    expect(lessonQueryEnd).toBe('2027-03-23T17:30:00.000Z')
  })

  it('does not widen the conflict window when no break is configured', async () => {
    const rows = breakRows(0, null)
    let lessonQueryEnd: string | undefined

    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return rows.organizations
      if (table === 'teachers') return rows.teachers
      if (table === 'lessons') {
        const chain = buildChain({ data: [{ id: 'lesson-1' }], error: null }) as Record<string, unknown>
        chain['lt'] = (_col: string, value: string) => {
          lessonQueryEnd = value
          return chain
        }
        return chain
      }
      return fallback(table)
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)

    expect(lessonQueryEnd).toBe(END)
  })
})

// ── validateSlotLock tests ────────────────────────────────────────────────────

describe('validateSlotLock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns valid: true for an active non-expired lock', async () => {
    const lock = {
      id: LOCK_ID, teacher_id: TEACHER_ID, student_id: null,
      start_at: START, end_at: END,
      expires_at: futureExpiry, status: 'active',
    }
    mockFrom.mockReturnValue(buildChain({ data: lock, error: null }))

    const result = await validateSlotLock(LOCK_ID, ORG_ID)
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.lock.id).toBe(LOCK_ID)
  })

  it('returns valid: false with reason "not_found" when lock does not exist', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    )

    const result = await validateSlotLock('nonexistent', ORG_ID)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('not_found')
  })

  it('returns valid: false with reason "expired" when expires_at is in the past', async () => {
    const lock = {
      id: LOCK_ID, teacher_id: TEACHER_ID, student_id: null,
      start_at: START, end_at: END,
      expires_at: pastExpiry, status: 'active',
    }
    mockFrom.mockReturnValue(buildChain({ data: lock, error: null }))

    const result = await validateSlotLock(LOCK_ID, ORG_ID)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('expired')
  })

  it('returns valid: false with reason "consumed" when lock is already consumed', async () => {
    const lock = {
      id: LOCK_ID, teacher_id: TEACHER_ID, student_id: null,
      start_at: START, end_at: END,
      expires_at: futureExpiry, status: 'consumed',
    }
    mockFrom.mockReturnValue(buildChain({ data: lock, error: null }))

    const result = await validateSlotLock(LOCK_ID, ORG_ID)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('consumed')
  })

  it('returns valid: false with reason "expired" when status is explicitly "expired"', async () => {
    const lock = {
      id: LOCK_ID, teacher_id: TEACHER_ID, student_id: null,
      start_at: START, end_at: END,
      expires_at: futureExpiry, status: 'expired',
    }
    mockFrom.mockReturnValue(buildChain({ data: lock, error: null }))

    const result = await validateSlotLock(LOCK_ID, ORG_ID)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('expired')
  })
})
