import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSlotLock, SlotUnavailableError } from './createSlotLock'
import { validateSlotLock } from './validateSlotLock'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockInsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const START = '2026-03-23T16:00:00.000Z'
const END = '2026-03-23T17:00:00.000Z'
const LOCK_ID = 'lock-1'

/** A future expiry — lock is still valid */
const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString()
/** A past expiry — lock is expired */
const pastExpiry = new Date(Date.now() - 1000).toISOString()

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'insert', 'update'].forEach(m => { self[m] = pass })
  self['single'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
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
      return buildChain({ data: [], error: null })
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
      return buildChain({ data: [], error: null })
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
  })

  it('throws SlotUnavailableError when an active slot lock already exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: [], error: null })
      if (table === 'slot_locks') {
        return buildChain({ data: [{ id: 'existing-lock' }], error: null })
      }
      return buildChain({ data: [], error: null })
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
      return buildChain({ data: [], error: null })
    })

    await expect(
      createSlotLock({ teacherId: TEACHER_ID, startAt: START, endAt: END, organizationId: ORG_ID })
    ).rejects.toThrow(SlotUnavailableError)
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
