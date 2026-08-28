import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  weekBoundsFor,
  getWeeklyQuotaStatus,
  assertWeeklyQuotaNotExceeded,
  WeeklyQuotaExceededError,
} from './weeklyQuota'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

const ORG_ID = 'org-1'
const STUDENT_ID = 'student-1'
const TZ = 'Asia/Jerusalem'

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'neq', 'gte', 'lt', 'gt', 'limit'].forEach((m) => { self[m] = pass })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
}

/** Wires the three tables getWeeklyQuotaStatus reads. */
function mockDb(opts: {
  enforce?: boolean
  quota?: number | null
  lessonsThisWeek?: number
}) {
  const rows = Array.from({ length: opts.lessonsThisWeek ?? 0 }, (_, i) => ({
    lesson_id: `lesson-${i}`,
    lessons: { id: `lesson-${i}` },
  }))

  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return buildChain({
        data: { timezone: TZ, enforce_weekly_quota: opts.enforce ?? true },
        error: null,
      })
    }
    if (table === 'students') {
      return buildChain({ data: { weekly_quota: opts.quota ?? null }, error: null })
    }
    if (table === 'lesson_students') return buildChain({ data: rows, error: null })
    return buildChain({ data: null, error: null })
  })
}

const PARAMS = { studentId: STUDENT_ID, organizationId: ORG_ID, slotStartUtc: '2026-08-26T09:00:00.000Z' }

describe('weekBoundsFor', () => {
  it('runs Sunday to Sunday in the org timezone', () => {
    // Wednesday 26 Aug 2026, 12:00 Israel time.
    const { startUtc, endUtc } = weekBoundsFor('2026-08-26T09:00:00.000Z', TZ)

    // Sunday 23 Aug 00:00 Israel time = Saturday 22 Aug 21:00 UTC.
    expect(startUtc).toBe('2026-08-22T21:00:00.000Z')
    expect(endUtc).toBe('2026-08-29T21:00:00.000Z')
  })

  it('keeps late Saturday night in the week that is ending', () => {
    // Saturday 29 Aug, 23:30 Israel time — still the Aug 23–29 week.
    const { startUtc } = weekBoundsFor('2026-08-29T20:30:00.000Z', TZ)
    expect(startUtc).toBe('2026-08-22T21:00:00.000Z')
  })

  it('reads the local clock, not the UTC one', () => {
    // Saturday 22:30 UTC is already Sunday 01:30 in Israel, so this instant
    // belongs to the NEXT week even though UTC still calls it Saturday.
    const { startUtc } = weekBoundsFor('2026-08-29T22:30:00.000Z', TZ)
    expect(startUtc).toBe('2026-08-29T21:00:00.000Z')
  })
})

describe('getWeeklyQuotaStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('treats a student with no quota as unlimited', async () => {
    mockDb({ quota: null, lessonsThisWeek: 5 })

    const status = await getWeeklyQuotaStatus(PARAMS)

    expect(status).toEqual({ quota: null, count: 0, atQuota: false })
    expect(mockFrom).not.toHaveBeenCalledWith('lesson_students')
  })

  it('reports the week as full once the quota is met', async () => {
    mockDb({ quota: 1, lessonsThisWeek: 1 })

    expect(await getWeeklyQuotaStatus(PARAMS)).toEqual({ quota: 1, count: 1, atQuota: true })
  })

  it('leaves room while the student is under the quota', async () => {
    mockDb({ quota: 2, lessonsThisWeek: 1 })

    expect(await getWeeklyQuotaStatus(PARAMS)).toEqual({ quota: 2, count: 1, atQuota: false })
  })

  it('skips the count entirely when the org does not enforce the quota', async () => {
    mockDb({ enforce: false, quota: 1, lessonsThisWeek: 3 })

    expect(await getWeeklyQuotaStatus(PARAMS)).toEqual({ quota: null, count: 0, atQuota: false })
    expect(mockFrom).not.toHaveBeenCalledWith('students')
    expect(mockFrom).not.toHaveBeenCalledWith('lesson_students')
  })

  it('counts only lessons that are not cancelled', async () => {
    // A cancelled lesson has to free the slot back up, otherwise "cancel and
    // re-book" — the way out the bot offers — would not work.
    const calls: Array<[string, unknown]> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({ data: { timezone: TZ, enforce_weekly_quota: true }, error: null })
      }
      if (table === 'students') return buildChain({ data: { weekly_quota: 1 }, error: null })
      const self = buildChain({ data: [], error: null }) as Record<string, unknown>
      self['neq'] = (column: string, value: unknown) => {
        calls.push([column, value])
        return self
      }
      return self
    })

    await getWeeklyQuotaStatus(PARAMS)

    expect(calls).toContainEqual(['lessons.status', 'cancelled'])
  })
})

describe('assertWeeklyQuotaNotExceeded', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws once the week is full', async () => {
    mockDb({ quota: 1, lessonsThisWeek: 1 })

    await expect(assertWeeklyQuotaNotExceeded(PARAMS)).rejects.toThrow(WeeklyQuotaExceededError)
  })

  it('passes while the student still has room', async () => {
    mockDb({ quota: 2, lessonsThisWeek: 1 })

    await expect(assertWeeklyQuotaNotExceeded(PARAMS)).resolves.toBeUndefined()
  })
})
