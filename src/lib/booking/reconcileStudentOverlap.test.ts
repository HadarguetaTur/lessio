/**
 * SCHED-06 — the student double-booking race.
 *
 * The teacher is protected by a GiST EXCLUDE. The student is protected by
 * nothing: lesson_students carries only UNIQUE (lesson_id, student_id), and
 * every check is read-then-insert with no transaction. Two requests booking the
 * same child with two different teachers at 17:00 both read "free".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reconcileStudentOverlap } from './reconcileStudentOverlap'

const ORG_ID = 'org-1'
const MINE = 'lesson-mine'
const THEIRS = 'lesson-theirs'
const STUDENT_ID = 'student-1'
const START = '2027-01-19T16:00:00.000Z'
const END = '2027-01-19T17:00:00.000Z'

let deletes: string[]

interface Wiring {
  mine?: { id: string; created_at: string } | null
  junction?: { lesson_id: string }[]
  clashes?: { id: string; created_at: string }[]
}

function fakeDb({ mine = { id: MINE, created_at: '2027-01-01T10:00:00.000Z' }, junction = [], clashes = [] }: Wiring) {
  deletes = []
  let lessonsQuery = 0

  const from = (table: string) => {
    const self: Record<string, unknown> = {}
    let isDelete = false
    let deletedId = ''
    const pass = () => self

    self['select'] = pass
    self['in'] = pass
    self['neq'] = pass
    self['lt'] = pass
    self['gt'] = pass
    self['limit'] = pass
    self['delete'] = () => {
      isDelete = true
      return self
    }
    self['eq'] = (column: string, value: unknown) => {
      if (column === 'id') deletedId = value as string
      return self
    }

    if (table === 'lessons') {
      const which = lessonsQuery++
      self['maybeSingle'] = async () => ({ data: mine, error: null })
      self['then'] = (res: (v: unknown) => unknown) => {
        if (isDelete) {
          deletes.push(deletedId)
          return Promise.resolve({ data: null, error: null }).then(res)
        }
        // Query 0 reads our own row, query 1 looks for clashes.
        return Promise.resolve({ data: which === 0 ? mine : clashes, error: null }).then(res)
      }
      return self
    }

    self['maybeSingle'] = async () => ({ data: null, error: null })
    self['then'] = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === 'lesson_students' ? junction : null, error: null }).then(res)
    return self
  }

  return { from } as never
}

const call = (wiring: Wiring) =>
  reconcileStudentOverlap({
    db: fakeDb(wiring),
    orgId: ORG_ID,
    lessonId: MINE,
    studentIds: [STUDENT_ID],
    startUtc: START,
    endUtc: END,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('reconcileStudentOverlap', () => {
  it('leaves the lesson alone when the student has nothing else', async () => {
    await expect(call({ junction: [], clashes: [] })).resolves.toBe(false)
    expect(deletes).toEqual([])
  })

  it('leaves the lesson alone when the other lessons do not overlap', async () => {
    // The overlap window is applied by the query; an empty clash list is what
    // "no overlap" looks like coming back.
    await expect(
      call({ junction: [{ lesson_id: THEIRS }], clashes: [] })
    ).resolves.toBe(false)
    expect(deletes).toEqual([])
  })

  it('withdraws the newer lesson when an older one already holds the student', async () => {
    const withdrawn = await call({
      mine: { id: MINE, created_at: '2027-01-01T10:00:00.500Z' },
      junction: [{ lesson_id: THEIRS }],
      clashes: [{ id: THEIRS, created_at: '2027-01-01T10:00:00.000Z' }],
    })

    expect(withdrawn).toBe(true)
    expect(deletes).toEqual([MINE])
  })

  it('keeps the older lesson when the other one arrived later', async () => {
    const withdrawn = await call({
      mine: { id: MINE, created_at: '2027-01-01T10:00:00.000Z' },
      junction: [{ lesson_id: THEIRS }],
      clashes: [{ id: THEIRS, created_at: '2027-01-01T10:00:00.500Z' }],
    })

    expect(withdrawn).toBe(false)
    expect(deletes).toEqual([])
  })

  it('breaks an exact timestamp tie so that exactly one side withdraws', async () => {
    // Two truly simultaneous inserts. Both racers evaluate the same pair with
    // the same rule, so the outcome must be asymmetric — otherwise they either
    // both survive (the bug) or both vanish.
    const sameInstant = '2027-01-01T10:00:00.000Z'
    const A = { id: 'lesson-aaa', created_at: sameInstant }
    const B = { id: 'lesson-bbb', created_at: sameInstant }

    const aWithdraws = await reconcileStudentOverlap({
      db: fakeDb({ mine: A, junction: [{ lesson_id: B.id }], clashes: [B] }),
      orgId: ORG_ID,
      lessonId: A.id,
      studentIds: [STUDENT_ID],
      startUtc: START,
      endUtc: END,
    })
    const bWithdraws = await reconcileStudentOverlap({
      db: fakeDb({ mine: B, junction: [{ lesson_id: A.id }], clashes: [A] }),
      orgId: ORG_ID,
      lessonId: B.id,
      studentIds: [STUDENT_ID],
      startUtc: START,
      endUtc: END,
    })

    expect([aWithdraws, bWithdraws]).toEqual([false, true])
  })

  it('does nothing for a lesson with no students', async () => {
    const withdrawn = await reconcileStudentOverlap({
      db: fakeDb({}),
      orgId: ORG_ID,
      lessonId: MINE,
      studentIds: [],
      startUtc: START,
      endUtc: END,
    })
    expect(withdrawn).toBe(false)
  })
})
