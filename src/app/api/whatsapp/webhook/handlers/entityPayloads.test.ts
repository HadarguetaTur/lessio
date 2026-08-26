import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSendTextMessage,
  mockHandleCancellationPayload,
  mockMarkAssignmentDoneAndAlert,
  mockFindBillingParent,
} = vi.hoisted(() => ({
  mockSendTextMessage: vi.fn(),
  mockHandleCancellationPayload: vi.fn(),
  mockMarkAssignmentDoneAndAlert: vi.fn(),
  mockFindBillingParent: vi.fn(),
}))

vi.mock('@/lib/whatsapp', () => ({ sendTextMessage: mockSendTextMessage }))
vi.mock('../cancellation', () => ({
  handleCancellationPayload: mockHandleCancellationPayload,
}))

// findOpenAssignments and studentDisplayName run against the stub db below; only
// the two helpers with side effects of their own are replaced.
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  markAssignmentDoneAndAlert: mockMarkAssignmentDoneAndAlert,
  findBillingParent: mockFindBillingParent,
}))

import { handleEntityPayload } from './entityPayloads'

const ORG_ID = 'org-1'
const PHONE = '+972501234567'
const PARENT_ID = 'parent-1'
const STUDENT_ID = 'student-1'
const LESSON_ID = '3f2b8a1c-9d4e-4f6a-8b2c-1e5d7a9c3b0f'
const ASSIGNMENT_ID = '7c1e4d2b-5a8f-4e3c-9b6d-2f0a8c4e1d7b'

type TableResult = { data: unknown; error?: unknown }

/**
 * A Supabase-shaped stub: every filter returns the chain, and the chain is
 * thenable so both `await chain` and `chain.maybeSingle()` resolve to whatever
 * the table is configured to return.
 *
 * `updates` records what was written, which is how the attendance assertions
 * tell a stamped lesson from an untouched one.
 */
function makeDb(tables: Record<string, TableResult>) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = []

  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: null }
    const chain: Record<string, unknown> = {}
    const pass = () => chain
    for (const m of ['select', 'eq', 'in', 'is', 'gt', 'order', 'limit']) chain[m] = pass
    chain.update = (payload: Record<string, unknown>) => {
      updates.push({ table, payload })
      return chain
    }
    chain.maybeSingle = () => Promise.resolve({ data: result.data, error: result.error ?? null })
    chain.single = chain.maybeSingle
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve)
    return chain
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from } as any, updates }
}

function params(
  db: ReturnType<typeof makeDb>['db'],
  payload: Parameters<typeof handleEntityPayload>[0]['payload']
) {
  return {
    db,
    orgId: ORG_ID,
    senderPhone: PHONE,
    accessToken: 'token',
    phoneNumberId: 'pn-1',
    locale: 'he' as const,
    timezone: 'Asia/Jerusalem',
    cancellationEnabled: true,
    payload,
  }
}

/** A phone that is a parent of one student, with that student on the lesson. */
function parentOfLesson(extra: Record<string, TableResult> = {}) {
  return makeDb({
    parents: { data: { id: PARENT_ID } },
    students: { data: [] },
    relationships: { data: [{ student_id: STUDENT_ID }] },
    lesson_students: { data: [{ student_id: STUDENT_ID }] },
    lessons: { data: { id: LESSON_ID, status: 'scheduled', attendance_confirmed_at: null } },
    ...extra,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendTextMessage.mockResolvedValue(undefined)
  mockHandleCancellationPayload.mockResolvedValue(undefined)
  mockMarkAssignmentDoneAndAlert.mockResolvedValue(undefined)
})

describe('attendance confirmation', () => {
  it('stamps the lesson and acknowledges', async () => {
    const { db, updates } = parentOfLesson()

    const handled = await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    expect(handled).toBe(true)
    const stamp = updates.find((u) => u.table === 'lessons')
    expect(stamp?.payload.attendance_confirmed_at).toEqual(expect.any(String))
    expect(stamp?.payload.attendance_confirmed_by).toBe('parent')
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('מגיעים'),
      'token',
      'pn-1'
    )
  })

  it('records a student tap as the student, not the parent', async () => {
    const { db, updates } = makeDb({
      parents: { data: null },
      students: { data: [{ id: STUDENT_ID }] },
      relationships: { data: [] },
      lesson_students: { data: [{ student_id: STUDENT_ID }] },
      lessons: { data: { id: LESSON_ID, status: 'scheduled', attendance_confirmed_at: null } },
    })

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    expect(updates.find((u) => u.table === 'lessons')?.payload.attendance_confirmed_by).toBe(
      'student'
    )
  })

  it('answers a second tap the same way without re-stamping', async () => {
    const { db, updates } = parentOfLesson({
      lessons: {
        data: {
          id: LESSON_ID,
          status: 'scheduled',
          attendance_confirmed_at: '2026-08-20T10:00:00Z',
        },
      },
    })

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    // The original timestamp stands, but the parent still gets an answer — they
    // cannot see whether the first tap registered.
    expect(updates.find((u) => u.table === 'lessons')).toBeUndefined()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('מגיעים'),
      'token',
      'pn-1'
    )
  })

  it('refuses a lesson that belongs to nobody on this phone', async () => {
    const { db, updates } = parentOfLesson({ lesson_students: { data: [] } })

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    expect(updates.find((u) => u.table === 'lessons')).toBeUndefined()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('כבר לא מופיע'),
      'token',
      'pn-1'
    )
  })

  it('refuses a lesson that is no longer scheduled', async () => {
    const { db, updates } = parentOfLesson({
      lessons: { data: { id: LESSON_ID, status: 'cancelled', attendance_confirmed_at: null } },
    })

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    expect(updates.find((u) => u.table === 'lessons')).toBeUndefined()
  })

  it('falls through when the phone has no student at all', async () => {
    const { db } = makeDb({
      parents: { data: null },
      students: { data: [] },
      relationships: { data: [] },
    })

    const handled = await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'ok', lessonId: LESSON_ID })
    )

    // Not handled — the caller carries on with normal routing rather than
    // swallowing the message.
    expect(handled).toBe(false)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })
})

describe('"need to cancel" on a reminder', () => {
  it('hands the named lesson to the cancellation confirm step', async () => {
    const { db } = parentOfLesson()

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'cancel', lessonId: LESSON_ID })
    )

    expect(mockHandleCancellationPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { step: 'pick', lessonId: LESSON_ID },
        actor: expect.objectContaining({ parentId: PARENT_ID, cancelledBy: 'parent' }),
      })
    )
  })

  it('cancels through the billing parent when a student taps', async () => {
    mockFindBillingParent.mockResolvedValue({ id: PARENT_ID, phone: '+972500000000', locale: 'he' })
    const { db } = makeDb({
      parents: { data: null },
      students: { data: [{ id: STUDENT_ID }] },
      relationships: { data: [] },
      lesson_students: { data: [{ student_id: STUDENT_ID }] },
      lessons: { data: { id: LESSON_ID, status: 'scheduled', attendance_confirmed_at: null } },
    })

    await handleEntityPayload(
      params(db, { kind: 'attendance', action: 'cancel', lessonId: LESSON_ID })
    )

    expect(mockHandleCancellationPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          parentId: PARENT_ID,
          cancelledBy: 'student',
          studentIds: [STUDENT_ID],
        }),
      })
    )
  })

  it('honours the org switch that turns cancellations off', async () => {
    const { db } = parentOfLesson()

    await handleEntityPayload({
      ...params(db, { kind: 'attendance', action: 'cancel', lessonId: LESSON_ID }),
      cancellationEnabled: false,
    })

    expect(mockHandleCancellationPayload).not.toHaveBeenCalled()
  })
})

describe('homework done', () => {
  const OPEN_ROW = {
    id: ASSIGNMENT_ID,
    title: 'פרק ג',
    student_id: STUDENT_ID,
    teacher_id: 'teacher-1',
    due_date: null,
  }

  it('marks the assignment done and confirms', async () => {
    const { db } = makeDb({
      parents: { data: { id: PARENT_ID } },
      students: { data: [] },
      relationships: { data: [{ student_id: STUDENT_ID }] },
      homework_assignments: { data: [OPEN_ROW] },
    })

    const handled = await handleEntityPayload(
      params(db, { kind: 'homework', action: 'done', assignmentId: ASSIGNMENT_ID })
    )

    expect(handled).toBe(true)
    expect(mockMarkAssignmentDoneAndAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        markedBy: 'parent',
        assignment: expect.objectContaining({ id: ASSIGNMENT_ID }),
      })
    )
  })

  it('answers a second tap without marking anything again', async () => {
    // Already done, so it is no longer in the open set.
    const { db } = makeDb({
      parents: { data: { id: PARENT_ID } },
      students: { data: [] },
      relationships: { data: [{ student_id: STUDENT_ID }] },
      homework_assignments: { data: [] },
    })

    await handleEntityPayload(
      params(db, { kind: 'homework', action: 'done', assignmentId: ASSIGNMENT_ID })
    )

    expect(mockMarkAssignmentDoneAndAlert).not.toHaveBeenCalled()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining('כבר מסומנים'),
      'token',
      'pn-1'
    )
  })

  it('refuses an assignment belonging to someone else', async () => {
    // The open set is this phone's own; a foreign id is simply not in it.
    const { db } = makeDb({
      parents: { data: { id: PARENT_ID } },
      students: { data: [] },
      relationships: { data: [{ student_id: STUDENT_ID }] },
      homework_assignments: { data: [OPEN_ROW] },
    })

    await handleEntityPayload(
      params(db, {
        kind: 'homework',
        action: 'done',
        assignmentId: '11111111-2222-3333-4444-555555555555',
      })
    )

    expect(mockMarkAssignmentDoneAndAlert).not.toHaveBeenCalled()
  })
})
