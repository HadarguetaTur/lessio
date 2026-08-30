import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLessonCountsForStudents } from './lessonHistory'

type LessonRow = { student_id: string; lessons: { status: string } }

/**
 * A chain whose every method returns itself and which resolves to the seeded
 * result when awaited — the shape the real query builder presents.
 */
function makeDb(result: { data: LessonRow[] | null; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'gte', 'lte']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)

  const from = vi.fn(() => chain)
  return { db: { from } as unknown as SupabaseClient, from, chain }
}

const WINDOW = { fromIso: '2025-05-01T00:00:00.000Z', toIso: '2026-04-18T23:59:59.999Z' }

describe('getLessonCountsForStudents', () => {
  it('groups tallies by student across one batched query', async () => {
    const { db, from } = makeDb({
      data: [
        { student_id: 's1', lessons: { status: 'completed' } },
        { student_id: 's1', lessons: { status: 'completed' } },
        { student_id: 's1', lessons: { status: 'cancelled' } },
        { student_id: 's2', lessons: { status: 'completed' } },
        { student_id: 's2', lessons: { status: 'no_show' } },
      ],
      error: null,
    })

    const counts = await getLessonCountsForStudents({
      db,
      orgId: 'org-1',
      studentIds: ['s1', 's2'],
      ...WINDOW,
    })

    expect(from).toHaveBeenCalledTimes(1)
    expect(counts.get('s1')).toEqual({ completed: 2, cancelled: 1, noShow: 0, held: 2 })
    expect(counts.get('s2')).toEqual({ completed: 1, cancelled: 0, noShow: 1, held: 2 })
  })

  it('counts held as completed plus no_show, and never counts cancelled as held', async () => {
    const { db } = makeDb({
      data: [
        { student_id: 's1', lessons: { status: 'completed' } },
        { student_id: 's1', lessons: { status: 'no_show' } },
        { student_id: 's1', lessons: { status: 'cancelled' } },
        { student_id: 's1', lessons: { status: 'cancelled' } },
      ],
      error: null,
    })

    const counts = await getLessonCountsForStudents({
      db,
      orgId: 'org-1',
      studentIds: ['s1'],
      ...WINDOW,
    })

    expect(counts.get('s1')).toEqual({ completed: 1, cancelled: 2, noShow: 1, held: 2 })
  })

  it('returns a zero-filled entry for every requested student, even with no rows', async () => {
    const { db } = makeDb({ data: [], error: null })

    const counts = await getLessonCountsForStudents({
      db,
      orgId: 'org-1',
      studentIds: ['s1', 's2'],
      ...WINDOW,
    })

    expect([...counts.keys()]).toEqual(['s1', 's2'])
    expect(counts.get('s2')).toEqual({ completed: 0, cancelled: 0, noShow: 0, held: 0 })
  })

  it('short-circuits without querying when there are no students', async () => {
    const { db, from } = makeDb({ data: [], error: null })

    const counts = await getLessonCountsForStudents({
      db,
      orgId: 'org-1',
      studentIds: [],
      ...WINDOW,
    })

    expect(counts.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it('throws when the query fails, so the caller can drop the section', async () => {
    const { db } = makeDb({ data: null, error: { message: 'connection reset' } })

    await expect(
      getLessonCountsForStudents({ db, orgId: 'org-1', studentIds: ['s1'], ...WINDOW })
    ).rejects.toThrow('connection reset')
  })

  // Pinned decision: lesson_students.status is not filtered. Nothing in the
  // product writes it, and filtering here would make this the only counter that
  // does — diverging from the progress report for the same child and window.
  it('counts a lesson that ran even when the per-student row says cancelled', async () => {
    const { db, chain } = makeDb({
      data: [{ student_id: 's1', lessons: { status: 'completed' } }],
      error: null,
    })

    const counts = await getLessonCountsForStudents({
      db,
      orgId: 'org-1',
      studentIds: ['s1'],
      ...WINDOW,
    })

    expect(counts.get('s1')?.completed).toBe(1)
    const filteredColumns = (chain.eq as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(filteredColumns).not.toContain('status')
  })
})
