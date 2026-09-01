/**
 * The prompt lifecycle. `findDayTail` is mocked here — its own arithmetic is
 * covered in dayTail.test.ts, and what matters at this layer is that a stored
 * row is trusted only as far as the live day agrees with it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockFindDayTail = vi.fn()
const mockExtendDayWindow = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./dayTail', () => ({
  findDayTail: (...args: unknown[]) => mockFindDayTail(...args),
}))

vi.mock('@/lib/availability-overrides/extendDayWindow', () => ({
  extendDayWindow: (...args: unknown[]) => mockExtendDayWindow(...args),
}))

import {
  getPendingTailPrompts,
  blockTailPrompt,
  dismissTailPrompt,
  extendTailPrompt,
} from './tailPrompts'

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const USER_ID = 'user-1'
const PROMPT_ID = 'prompt-1'
const DATE = '2026-03-23'

const inserted: Record<string, unknown>[] = []
const updates: Record<string, unknown>[] = []

function chain(result: unknown, hooks: Record<string, unknown> = {}) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'order', 'limit'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  Object.assign(self, hooks)
  return self
}

/** `promptRow` is what a pending lookup finds; null means "nothing pending". */
function setup(promptRow: Record<string, unknown> | null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'availability_tail_prompts') {
      return chain(
        { data: promptRow, error: null },
        {
          update: (patch: Record<string, unknown>) => {
            updates.push(patch)
            return chain({ data: null, error: null })
          },
        }
      )
    }
    if (table === 'availability_overrides') {
      return chain(
        { data: [], error: null },
        {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row)
            return chain({ data: null, error: null })
          },
        }
      )
    }
    return chain({ data: [], error: null })
  })
}

const pendingRow = {
  id: PROMPT_ID,
  teacher_id: TEACHER_ID,
  tail_date: DATE,
  tail_start: '19:00',
  tail_end: '19:20',
}

describe('getPendingTailPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    updates.length = 0
  })

  it('drops a stored prompt whose leftover no longer exists', async () => {
    // The lesson that stranded the time was cancelled; the question is moot.
    mockFrom.mockImplementation(() => chain({ data: [pendingRow], error: null }))
    mockFindDayTail.mockResolvedValue(null)

    expect(await getPendingTailPrompts({ orgId: ORG_ID, today: DATE })).toEqual([])
  })

  // The row records that the teacher was asked; the day decides what is true now.
  it('reports the live remainder, not the stored one', async () => {
    mockFrom.mockImplementation(() => chain({ data: [pendingRow], error: null }))
    mockFindDayTail.mockResolvedValue({ start: '18:30', end: '19:20', minutes: 50 })

    const prompts = await getPendingTailPrompts({ orgId: ORG_ID, today: DATE })

    expect(prompts).toEqual([
      { id: PROMPT_ID, teacherId: TEACHER_ID, date: DATE, start: '18:30', end: '19:20', minutes: 50 },
    ])
  })
})

describe('resolving a prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    updates.length = 0
  })

  it('refuses a prompt that is not pending or not this teacher\'s', async () => {
    setup(null)

    expect(
      await dismissTailPrompt({ orgId: ORG_ID, promptId: PROMPT_ID, resolvedBy: USER_ID })
    ).toEqual({ key: 'promptNotFound' })
    expect(updates).toEqual([])
  })

  it('marks a dismissed prompt resolved without touching availability', async () => {
    setup(pendingRow)

    expect(
      await dismissTailPrompt({ orgId: ORG_ID, promptId: PROMPT_ID, resolvedBy: USER_ID })
    ).toBeNull()

    expect(inserted).toEqual([])
    expect(updates[0]).toMatchObject({ status: 'dismissed', resolved_by: USER_ID })
  })

  it('blocks the live remainder, not the stored times', async () => {
    // A lesson moved after the prompt was raised; blocking 19:00 would close
    // hours the teacher actually has free.
    setup(pendingRow)
    mockFindDayTail.mockResolvedValue({ start: '18:40', end: '19:20', minutes: 40 })

    expect(
      await blockTailPrompt({ orgId: ORG_ID, promptId: PROMPT_ID, resolvedBy: USER_ID })
    ).toBeNull()

    expect(inserted[0]).toMatchObject({
      teacher_id: TEACHER_ID,
      override_date: DATE,
      is_available: false,
      start_time: '18:40',
      end_time: '19:20',
    })
    expect(updates[0]).toMatchObject({ status: 'blocked' })
  })

  it('quietly retires a block request whose leftover vanished', async () => {
    setup(pendingRow)
    mockFindDayTail.mockResolvedValue(null)

    expect(
      await blockTailPrompt({ orgId: ORG_ID, promptId: PROMPT_ID, resolvedBy: USER_ID })
    ).toBeNull()

    expect(inserted).toEqual([])
    expect(updates[0]).toMatchObject({ status: 'dismissed' })
  })

  it('extends the day and records why the prompt closed', async () => {
    setup(pendingRow)
    mockExtendDayWindow.mockResolvedValue(null)

    expect(
      await extendTailPrompt({
        orgId: ORG_ID,
        promptId: PROMPT_ID,
        newEndTime: '20:00',
        resolvedBy: USER_ID,
      })
    ).toBeNull()

    expect(mockExtendDayWindow).toHaveBeenCalledWith({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      date: DATE,
      newEndTime: '20:00',
    })
    expect(updates[0]).toMatchObject({ status: 'extended' })
  })

  it('leaves the prompt open when the extension is rejected', async () => {
    setup(pendingRow)
    mockExtendDayWindow.mockResolvedValue({ key: 'extendTooEarly' })

    expect(
      await extendTailPrompt({
        orgId: ORG_ID,
        promptId: PROMPT_ID,
        newEndTime: '19:00',
        resolvedBy: USER_ID,
      })
    ).toEqual({ key: 'extendTooEarly' })

    expect(updates).toEqual([])
  })
})
