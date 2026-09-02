import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockRedirect, mockInviteUserByEmail, mockFrom, mockRequireQuota } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockRedirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`)
    }),
    mockInviteUserByEmail: vi.fn(),
    mockFrom: vi.fn(),
    mockRequireQuota: vi.fn(),
  }))

vi.mock('@/lib/saas/quota', () => ({
  requireQuotaCapacity: mockRequireQuota,
  QuotaExceededError: class QuotaExceededError extends Error {
    constructor(
      public kind: string,
      public limit: number
    ) {
      super(`QUOTA_EXCEEDED:${kind}`)
      this.name = 'QuotaExceededError'
    }
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
      },
    },
    from: (table: string) => mockFrom(table),
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { inviteTeacher } from './actions'

describe('inviteTeacher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
    mockRequireQuota.mockResolvedValue(undefined)
  })

  it('checks the seat quota BEFORE creating the auth user', async () => {
    // Ordering is the whole point. An invite that creates the auth.users row
    // and is then rejected burns the email address permanently — the retry
    // after upgrading returns "already been registered", and the customer
    // cannot add the teacher they just paid for.
    const { QuotaExceededError } = await import('@/lib/saas/quota')
    mockRequireQuota.mockRejectedValue(new QuotaExceededError('teachers', 5))

    const fd = new FormData()
    fd.set('email', 'new@example.com')
    fd.set('full_name', 'New Teacher')

    await expect(inviteTeacher(null, fd)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    })
    expect(mockInviteUserByEmail).not.toHaveBeenCalled()
    expect(mockRequireQuota).toHaveBeenCalledWith('org-1', 'teachers')
  })

  it('sends the invite and creates profile and teacher records', async () => {
    const insertedProfiles: Record<string, unknown>[] = []
    const insertedTeachers: Record<string, unknown>[] = []

    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            insertedProfiles.push(payload)
            return { error: null }
          },
        }
      }

      if (table === 'teachers') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            insertedTeachers.push(payload)
            return { error: null }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const formData = new FormData()
    formData.set('email', ' Teacher@Example.com ')
    formData.set('full_name', 'מורה חדש')

    await expect(inviteTeacher(null, formData)).rejects.toThrow('REDIRECT:/teachers')

    expect(mockInviteUserByEmail).toHaveBeenCalledWith('teacher@example.com')
    expect(insertedProfiles).toEqual([
      {
        id: 'user-123',
        organization_id: 'org-1',
        full_name: 'מורה חדש',
        // Optional, and omitted here — the WhatsApp bot simply cannot recognise
        // this teacher until a phone is filled in.
        phone: null,
        role: 'teacher',
      },
    ])
    expect(insertedTeachers).toEqual([
      {
        organization_id: 'org-1',
        profile_id: 'user-123',
      },
    ])
  })

  /**
   * The phone is what resolveSender() matches an inbound WhatsApp message
   * against, so it has to land in the DB in E.164 like every other phone —
   * an un-normalized "052-123-4567" would never match.
   */
  it('normalizes the phone before storing it on the profile', async () => {
    const insertedProfiles: Record<string, unknown>[] = []

    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    mockFrom.mockImplementation((table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        if (table === 'profiles') insertedProfiles.push(payload)
        return { error: null }
      },
    }))

    const formData = new FormData()
    formData.set('email', 'teacher@example.com')
    formData.set('full_name', 'מורה חדש')
    formData.set('phone', '052-123-4567')

    await expect(inviteTeacher(null, formData)).rejects.toThrow('REDIRECT:/teachers')

    expect(insertedProfiles[0].phone).toBe('+972521234567')
  })

  it('rejects an unparseable phone instead of storing it', async () => {
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    const formData = new FormData()
    formData.set('email', 'teacher@example.com')
    formData.set('full_name', 'מורה חדש')
    formData.set('phone', 'not-a-phone')

    await expect(inviteTeacher(null, formData)).resolves.toEqual({
      error: 'מספר הטלפון אינו תקין',
    })
    // Bailed before creating the auth user.
    expect(mockInviteUserByEmail).not.toHaveBeenCalled()
  })

  it('returns a friendly error when the email is already registered', async () => {
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user has already been registered with this email address' },
    })

    const formData = new FormData()
    formData.set('email', 'teacher@example.com')
    formData.set('full_name', 'מורה חדש')

    await expect(inviteTeacher(null, formData)).resolves.toEqual({
      error: 'כתובת אימייל זו כבר רשומה במערכת',
    })
  })
})
