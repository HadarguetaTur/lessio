import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockInsert,
  mockDelete,
  mockEq,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockEq: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { claimIncomingMessage, releaseIncomingMessageClaim, isRateLimited } from './idempotency'

describe('whatsapp idempotency helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims a message when the insert succeeds', async () => {
    mockInsert.mockResolvedValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({ insert: mockInsert })),
    })

    await expect(claimIncomingMessage('org-1', 'msg-1', '+972501234567')).resolves.toBe(true)
    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      message_id: 'msg-1',
      phone: '+972501234567',
    })
  })

  it('treats duplicate key errors as already claimed', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({ insert: mockInsert })),
    })

    await expect(claimIncomingMessage('org-1', 'msg-1', '+972501234567')).resolves.toBe(false)
  })

  it('throws on unexpected insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { code: '500', message: 'db down' } })
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({ insert: mockInsert })),
    })

    await expect(
      claimIncomingMessage('org-1', 'msg-1', '+972501234567')
    ).rejects.toThrow('Failed to claim incoming WhatsApp message: db down')
  })

  it('resolves when releasing a claim succeeds', async () => {
    mockEq
      .mockReturnValueOnce({ eq: mockEq })
      .mockResolvedValueOnce({ error: null })
    mockDelete.mockReturnValue({ eq: mockEq })
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({ delete: mockDelete })),
    })

    await expect(releaseIncomingMessageClaim('org-1', 'msg-1')).resolves.toBeUndefined()
  })

  it('logs and resolves when releasing a claim fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockEq
      .mockReturnValueOnce({ eq: mockEq })
      .mockResolvedValueOnce({ error: { message: 'delete failed' } })
    mockDelete.mockReturnValue({ eq: mockEq })
    mockCreateServiceRoleClient.mockReturnValue({
      from: vi.fn(() => ({ delete: mockDelete })),
    })

    await expect(releaseIncomingMessageClaim('org-1', 'msg-1')).resolves.toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeCountClient(result: { count: number | null; error: { message: string } | null }) {
    const chain: Record<string, unknown> = {}
    const pass = () => chain
    ;['select', 'eq'].forEach((m) => { chain[m] = pass })
    chain['gt'] = vi.fn().mockResolvedValue(result)
    return { from: vi.fn(() => chain) }
  }

  it('returns true at 30 or more messages in the window', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeCountClient({ count: 30, error: null }))
    await expect(isRateLimited('org-1', '+972501234567')).resolves.toBe(true)
  })

  it('returns false below the threshold', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeCountClient({ count: 29, error: null }))
    await expect(isRateLimited('org-1', '+972501234567')).resolves.toBe(false)
  })

  it('fails open on a count query error', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue(makeCountClient({ count: null, error: { message: 'db down' } }))

    await expect(isRateLimited('org-1', '+972501234567')).resolves.toBe(false)
    expect(consoleWarnSpy).toHaveBeenCalled()

    consoleWarnSpy.mockRestore()
  })
})
