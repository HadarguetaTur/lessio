import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('./takeover', () => ({
  getActiveTakeovers: vi.fn().mockResolvedValue(new Map()),
  getTakeover: vi.fn().mockResolvedValue(null),
}))

import { canTeacherAccessPhone, getConversationSummaries, getThread } from './conversations'
import { getActiveTakeovers } from './takeover'

type TableData = Record<string, unknown[]>

/**
 * A Supabase stub that answers by table name and ignores filters — the tests
 * assert on how this module REDUCES rows, not on PostgREST's own filtering.
 * `phonesReachableByTeacher` is the exception, and gets explicit table fixtures.
 */
function mockTables(tables: TableData) {
  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => {
      const rows = tables[table] ?? []
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'gte', 'gt', 'in', 'order', 'limit']) {
        chain[method] = () => chain
      }
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve)
      return chain
    },
  })
}

const message = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  phone: '+972501111111',
  direction: 'in',
  origin: null,
  sender_role: 'parent',
  sent_by_profile_id: null,
  kind: 'text',
  body: 'שלום',
  created_at: '2026-09-03T08:00:00.000Z',
  ...over,
})

describe('getConversationSummaries()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getActiveTakeovers).mockResolvedValue(new Map())
  })

  it('keeps one row per phone — the newest', async () => {
    mockTables({
      whatsapp_messages: [
        message({ id: 'newest', body: 'latest', created_at: '2026-09-03T10:00:00.000Z' }),
        message({ id: 'older', body: 'older', created_at: '2026-09-03T09:00:00.000Z' }),
      ],
      parents: [{ phone: '+972501111111', full_name: 'דנה כהן' }],
      students: [],
      teachers: [],
      profiles: [],
    })

    const summaries = await getConversationSummaries('org-1')

    expect(summaries).toHaveLength(1)
    expect(summaries[0].lastMessage).toBe('latest')
    expect(summaries[0].displayName).toBe('דנה כהן')
    expect(summaries[0].senderRole).toBe('parent')
  })

  it('flags a conversation whose last message came in as awaiting a reply', async () => {
    mockTables({
      whatsapp_messages: [message({ direction: 'in' })],
      parents: [],
      students: [],
      teachers: [],
      profiles: [],
    })

    expect((await getConversationSummaries('org-1'))[0].awaitingReply).toBe(true)
  })

  it('does not flag one the business answered last', async () => {
    mockTables({
      whatsapp_messages: [message({ direction: 'out', origin: 'bot' })],
      parents: [],
      students: [],
      teachers: [],
      profiles: [],
    })

    expect((await getConversationSummaries('org-1'))[0].awaitingReply).toBe(false)
  })

  it('marks conversations a person has taken over', async () => {
    vi.mocked(getActiveTakeovers).mockResolvedValue(
      new Map([
        [
          '+972501111111',
          { phone: '+972501111111', takenByProfileId: 'p1', expiresAt: '2999-01-01T00:00:00Z' },
        ],
      ])
    )
    mockTables({
      whatsapp_messages: [message()],
      parents: [],
      students: [],
      teachers: [],
      profiles: [],
    })

    expect((await getConversationSummaries('org-1'))[0].takenOver).toBe(true)
  })

  it('falls back to the phone and "unknown" for a number matching nobody', async () => {
    mockTables({
      whatsapp_messages: [message({ sender_role: null })],
      parents: [],
      students: [],
      teachers: [],
      profiles: [],
    })

    const summary = (await getConversationSummaries('org-1'))[0]
    expect(summary.displayName).toBeNull()
    expect(summary.senderRole).toBe('unknown')
  })

  it('prefers the parent identity when one phone is both a parent and a teacher', async () => {
    mockTables({
      whatsapp_messages: [message()],
      parents: [{ phone: '+972501111111', full_name: 'דנה ההורה' }],
      students: [],
      teachers: [{ profiles: { phone: '+972501111111', full_name: 'דנה המורה' } }],
      profiles: [],
    })

    const summary = (await getConversationSummaries('org-1'))[0]
    expect(summary.senderRole).toBe('parent')
    expect(summary.displayName).toBe('דנה ההורה')
  })
})

describe('teacher scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getActiveTakeovers).mockResolvedValue(new Map())
  })

  /** Only the phones in `parents` come back from the reachability query. */
  function mockTeacherReach(options: {
    assignedStudents?: string[]
    lessonStudents?: string[]
    relationshipParents?: string[]
    reachableParentPhones?: string[]
    messages?: unknown[]
  }) {
    mockTables({
      whatsapp_messages: options.messages ?? [message()],
      students: (options.assignedStudents ?? []).map((id) => ({ id })),
      lesson_students: (options.lessonStudents ?? []).map((id) => ({ student_id: id })),
      relationships: (options.relationshipParents ?? []).map((id) => ({ parent_id: id })),
      parents: (options.reachableParentPhones ?? []).map((phone) => ({
        phone,
        full_name: 'הורה',
      })),
      teachers: [],
      profiles: [],
    })
  }

  it('keeps the parent of a student assigned to this teacher', async () => {
    mockTeacherReach({
      assignedStudents: ['student-1'],
      relationshipParents: ['parent-1'],
      reachableParentPhones: ['+972501111111'],
    })

    const summaries = await getConversationSummaries('org-1', { teacherId: 'teacher-1' })
    expect(summaries.map((s) => s.phone)).toEqual(['+972501111111'])
  })

  it('keeps the parent of a student who only shares a lesson with this teacher', async () => {
    mockTeacherReach({
      assignedStudents: [],
      lessonStudents: ['student-2'],
      relationshipParents: ['parent-2'],
      reachableParentPhones: ['+972501111111'],
    })

    expect(await getConversationSummaries('org-1', { teacherId: 'teacher-1' })).toHaveLength(1)
  })

  it('drops a conversation with a parent this teacher does not reach', async () => {
    mockTeacherReach({
      assignedStudents: ['student-1'],
      relationshipParents: ['parent-1'],
      // The reachability lookup matches no phone in the transcript.
      reachableParentPhones: [],
    })

    expect(await getConversationSummaries('org-1', { teacherId: 'teacher-1' })).toEqual([])
  })

  it('shows a teacher nothing when they have no students at all', async () => {
    mockTeacherReach({ assignedStudents: [], lessonStudents: [] })

    expect(await getConversationSummaries('org-1', { teacherId: 'teacher-1' })).toEqual([])
  })

  it('canTeacherAccessPhone agrees with the list', async () => {
    mockTeacherReach({
      assignedStudents: ['student-1'],
      relationshipParents: ['parent-1'],
      reachableParentPhones: ['+972501111111'],
    })
    expect(await canTeacherAccessPhone('org-1', 'teacher-1', '+972501111111')).toBe(true)

    mockTeacherReach({ assignedStudents: [], lessonStudents: [] })
    expect(await canTeacherAccessPhone('org-1', 'teacher-1', '+972501111111')).toBe(false)
  })
})

describe('getThread()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns messages oldest-first, naming the staff member who replied', async () => {
    mockTables({
      whatsapp_messages: [
        message({
          id: 'reply',
          direction: 'out',
          origin: 'staff',
          sent_by_profile_id: 'profile-1',
          body: 'כבר מטפלים',
          created_at: '2026-09-03T10:00:00.000Z',
        }),
        message({ id: 'question', created_at: '2026-09-03T09:00:00.000Z' }),
      ],
      profiles: [{ id: 'profile-1', full_name: 'הדר' }],
    })

    const thread = await getThread('org-1', '+972501111111')

    // Fetched newest-first so a limit keeps the recent end; displayed oldest-first.
    expect(thread.map((m) => m.id)).toEqual(['question', 'reply'])
    expect(thread[0].isInbound).toBe(true)
    expect(thread[1].senderName).toBe('הדר')
    expect(thread[1].origin).toBe('staff')
  })
})
