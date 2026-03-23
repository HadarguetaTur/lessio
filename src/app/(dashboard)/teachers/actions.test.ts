import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockRedirect, mockInviteUserByEmail, mockFrom } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  mockInviteUserByEmail: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
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
    mockGetSession.mockResolvedValue({ orgId: 'org-1' })
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
