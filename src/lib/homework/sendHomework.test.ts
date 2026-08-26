import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockSendSmartMessage } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSendSmartMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))
vi.mock('@/lib/whatsapp/sendSmart', () => ({ sendSmartMessage: mockSendSmartMessage }))

import { sendHomeworkAssignment } from './sendHomework'

const ORG = 'org-1'
const ASSIGNMENT = 'assignment-1'

/** Captured arguments of the update that marks an assignment as sent. */
type UpdateCall = { payload: Record<string, unknown>; filters: Array<[string, string]> }

function buildClient(updates: UpdateCall[]) {
  return (table: string) => {
    if (table === 'homework_assignments') {
      return {
        select: () => {
          const b: Record<string, unknown> = {}
          Object.assign(b, {
            eq: vi.fn(() => b),
            single: async () => ({
              data: {
                id: ASSIGNMENT,
                title: 'סולם דו מז׳ור',
                body: 'לתרגל עולה ויורד',
                due_date: '2026-09-01',
                students: {
                  phone: null,
                  relationships: [
                    { is_primary: true, parents: { phone: '+972500000101', preferred_locale: 'he' } },
                  ],
                },
              },
              error: null,
            }),
          })
          return b
        },
        update: (payload: Record<string, unknown>) => {
          const call: UpdateCall = { payload, filters: [] }
          updates.push(call)
          const b: Record<string, unknown> = {}
          Object.assign(b, {
            eq: vi.fn((column: string, value: string) => {
              call.filters.push([column, value])
              return b
            }),
            then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
          })
          return b
        },
      }
    }

    if (table === 'organizations') {
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        eq: vi.fn(() => b),
        single: async () => ({ data: { default_locale: 'he' }, error: null }),
        maybeSingle: async () => ({ data: { default_locale: 'he' }, error: null }),
      })
      return { select: () => b }
    }

    throw new Error(`Unexpected table: ${table}`)
  }
}

describe('sendHomeworkAssignment', () => {
  let updates: UpdateCall[]

  beforeEach(() => {
    vi.clearAllMocks()
    updates = []
    mockFrom.mockImplementation(buildClient(updates))
    mockSendSmartMessage.mockResolvedValue({ sent: true })
  })

  /**
   * `sent` gates the parent portal's homework list and `sent_at` is the
   * timestamp the teacher sees. Writing only `sent_at` — as this did — left
   * every dashboard-sent assignment invisible to parents forever.
   */
  it('marks the assignment sent in both columns', async () => {
    const ok = await sendHomeworkAssignment({
      orgId: ORG,
      assignmentId: ASSIGNMENT,
      accessToken: 'token',
      phoneNumberId: 'phone-1',
    })

    expect(ok).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toMatchObject({ sent: true })
    expect(updates[0].payload.sent_at).toEqual(expect.any(String))
  })

  it('scopes the update to the organization', async () => {
    await sendHomeworkAssignment({
      orgId: ORG,
      assignmentId: ASSIGNMENT,
      accessToken: 'token',
      phoneNumberId: 'phone-1',
    })

    expect(updates[0].filters).toEqual(
      expect.arrayContaining([
        ['id', ASSIGNMENT],
        ['organization_id', ORG],
      ])
    )
  })

  it('does not mark anything sent when WhatsApp rejects the message', async () => {
    mockSendSmartMessage.mockRejectedValue(new Error('meta 131047'))

    const ok = await sendHomeworkAssignment({
      orgId: ORG,
      assignmentId: ASSIGNMENT,
      accessToken: 'token',
      phoneNumberId: 'phone-1',
    })

    expect(ok).toBe(false)
    expect(updates).toHaveLength(0)
  })
})
