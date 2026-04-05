import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRevalidatePath,
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { saveAiAssistantSettings } from './actions'

function makeDbClient(result: { error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn(() => ({ eq }))
  return {
    client: {
      from: vi.fn(() => ({ update })),
    },
    spies: { eq, update },
  }
}

describe('saveAiAssistantSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      role: 'owner',
      isSupportMode: false,
    })
    mockRequireMutation.mockImplementation(() => {})
  })

  it('saves the enabled flag for an owner session', async () => {
    const db = makeDbClient({ error: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const formData = new FormData()
    formData.set('ai_assistant_enabled', 'on')

    const result = await saveAiAssistantSettings({ error: null }, formData)

    expect(result).toEqual({ error: null, success: true })
    expect(db.spies.update).toHaveBeenCalledWith({ ai_assistant_enabled: true })
    expect(db.spies.eq).toHaveBeenCalledWith('id', 'org-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/settings/ai-assistant')
  })

  it('blocks support-mode edits via requireMutation', async () => {
    mockRequireMutation.mockImplementation(() => {
      throw new Error('מצב תמיכה הוא קריאה בלבד. פעולות עריכה אינן מותרות.')
    })

    const formData = new FormData()
    formData.set('ai_assistant_enabled', 'on')

    const result = await saveAiAssistantSettings({ error: null }, formData)

    expect(result.error).toContain('מצב תמיכה הוא קריאה בלבד')
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('rejects non-owner sessions', async () => {
    mockGetSession.mockResolvedValue({
      orgId: 'org-1',
      role: 'admin',
      isSupportMode: false,
    })

    const result = await saveAiAssistantSettings({ error: null }, new FormData())

    expect(result).toEqual({ error: 'אין הרשאה לביצוע פעולה זו' })
    expect(mockRequireMutation).not.toHaveBeenCalled()
  })

  it('validates unexpected form values', async () => {
    const formData = new FormData()
    formData.set('ai_assistant_enabled', 'true')

    const result = await saveAiAssistantSettings({ error: null }, formData)

    expect(result.error).toBe('נתונים לא תקינים')
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })
})
