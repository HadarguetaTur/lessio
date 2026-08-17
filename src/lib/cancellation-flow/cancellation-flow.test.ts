import { describe, it, expect, vi } from 'vitest'
import { hasCancellationIntent } from '@/lib/whatsapp'
import {
  formatLessonListMessage,
  getActiveCancellationSession,
  getEligibleLessons,
} from '@/lib/cancellation-flow'
import type { EligibleLesson } from '@/lib/cancellation-flow'

// ── Mock for DB-backed session tests ─────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

describe('hasCancellationIntent', () => {
  it('detects Hebrew ביטול', () => {
    expect(hasCancellationIntent('ביטול')).toBe(true)
    expect(hasCancellationIntent('אני רוצה ביטול')).toBe(true)
  })

  it('detects Hebrew לבטל', () => {
    expect(hasCancellationIntent('לבטל שיעור')).toBe(true)
    expect(hasCancellationIntent('אני רוצה לבטל')).toBe(true)
  })

  it('detects English cancel case-insensitively', () => {
    expect(hasCancellationIntent('cancel')).toBe(true)
    expect(hasCancellationIntent('Cancel lesson')).toBe(true)
    expect(hasCancellationIntent('CANCEL')).toBe(true)
    expect(hasCancellationIntent('cancel lesson please')).toBe(true)
  })

  it('returns false for unrelated messages', () => {
    expect(hasCancellationIntent('שלום')).toBe(false)
    expect(hasCancellationIntent('קביעה')).toBe(false)
    expect(hasCancellationIntent('שיעור')).toBe(false)
    expect(hasCancellationIntent('')).toBe(false)
  })
})

describe('formatLessonListMessage', () => {
  const lessons: EligibleLesson[] = [
    {
      id: 'lesson-1',
      start_at: '2026-01-05T14:00:00.000Z',
      student_name: 'ישראל ישראלי',
      teacher_name: 'שרה כהן',
    },
    {
      id: 'lesson-2',
      start_at: '2026-01-07T10:00:00.000Z',
      student_name: 'רבקה לוי',
      teacher_name: 'דוד לוי',
    },
  ]

  it('includes all required fields: number, student, date, time, teacher', () => {
    const msg = formatLessonListMessage(lessons, 'Asia/Jerusalem')
    expect(msg).toContain('1.')
    expect(msg).toContain('2.')
    expect(msg).toContain('ישראל ישראלי')
    expect(msg).toContain('שרה כהן')
    expect(msg).toContain('רבקה לוי')
    expect(msg).toContain('דוד לוי')
    // Time and date present
    expect(msg).toMatch(/\d{2}:\d{2}/)
  })

  it('numbers rows sequentially starting from 1', () => {
    const msg = formatLessonListMessage(lessons, 'Asia/Jerusalem')
    const idx1 = msg.indexOf('1.')
    const idx2 = msg.indexOf('2.')
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThan(idx1)
  })
})

// ── Scoping ───────────────────────────────────────────────────────────────────

/**
 * A student cancelling from their own phone passes their own id. The narrowing
 * intersects with the parent's students rather than replacing them, so it can
 * only ever restrict what comes back — a student can never reach a lesson that
 * is not on their parent's account.
 */
describe('getEligibleLessons — student narrowing', () => {
  /** Routes each table to a canned result and records the ids it was asked for. */
  function mockTables(rows: Record<string, unknown>): Record<string, unknown[]> {
    const askedFor: Record<string, unknown[]> = {}
    mockFrom.mockImplementation((table: string) => {
      const self: Record<string, unknown> = {}
      const pass = () => self
      ;['select', 'eq', 'gte', 'lt', 'order'].forEach((m) => {
        self[m] = pass
      })
      self['in'] = (_column: string, ids: unknown[]) => {
        askedFor[table] = ids
        return self
      }
      self['then'] = (r: (v: unknown) => unknown) =>
        Promise.resolve(rows[table] ?? { data: [], error: null }).then(r)
      return self
    })
    return askedFor
  }

  const TWO_CHILDREN = {
    data: [{ student_id: 'student-1' }, { student_id: 'student-2' }],
    error: null,
  }

  it('looks up only the named student', async () => {
    const askedFor = mockTables({ relationships: TWO_CHILDREN })

    await getEligibleLessons('org-1', 'parent-1', ['student-2'])

    expect(askedFor['lesson_students']).toEqual(['student-2'])
  })

  it('looks up every one of the parent’s students when none is named', async () => {
    const askedFor = mockTables({ relationships: TWO_CHILDREN })

    await getEligibleLessons('org-1', 'parent-1')

    expect(askedFor['lesson_students']).toEqual(['student-1', 'student-2'])
  })

  it('returns nothing for a student the parent is not linked to', async () => {
    const askedFor = mockTables({ relationships: TWO_CHILDREN })

    const result = await getEligibleLessons('org-1', 'parent-1', ['someone-elses-child'])

    expect(result).toEqual([])
    // Not even queried — the intersection is empty before any lesson lookup.
    expect(askedFor['lesson_students']).toBeUndefined()
  })
})

// ── State machine: timeout ────────────────────────────────────────────────────

describe('getActiveCancellationSession — timeout behavior', () => {
  it('returns null when session has expired (timeout closes flow after 10 min)', async () => {
    // Simulate DB returning null because the .gt('expires_at', now) filter found no rows
    mockFrom.mockImplementation(() => {
      const self: Record<string, unknown> = {}
      const pass = () => self
      ;['select', 'eq', 'gt'].forEach(m => { self[m] = pass })
      self['maybeSingle'] = () => Promise.resolve({ data: null, error: null })
      return self
    })

    const result = await getActiveCancellationSession('org-1', '+972501234567')
    expect(result).toBeNull()
  })

  it('returns the session when it has not expired yet', async () => {
    const activeSession = {
      id: 'session-1',
      organization_id: 'org-1',
      phone: '+972501234567',
      lesson_ids: ['lesson-a'],
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    }

    mockFrom.mockImplementation(() => {
      const self: Record<string, unknown> = {}
      const pass = () => self
      ;['select', 'eq', 'gt'].forEach(m => { self[m] = pass })
      self['maybeSingle'] = () => Promise.resolve({ data: activeSession, error: null })
      return self
    })

    const result = await getActiveCancellationSession('org-1', '+972501234567')
    expect(result).not.toBeNull()
    expect(result?.lesson_ids).toEqual(['lesson-a'])
  })
})
