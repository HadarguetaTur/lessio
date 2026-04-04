import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoist mock store so it's available inside vi.mock factory ────────────────

const { mockCookieStore } = vi.hoisted(() => ({
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}))

// ── Set required env var ─────────────────────────────────────────────────────

process.env.SUPPORT_SESSION_SECRET = 'test-support-secret-at-least-32-chars-long'

import { signSupportSession, verifySupportSession, getSupportSession } from './index'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('signSupportSession / verifySupportSession', () => {
  const payload = {
    superAdminId: 'sa-1',
    targetOrgId: 'org-1',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }

  it('signs and verifies a valid session', async () => {
    const token = await signSupportSession(payload)
    expect(typeof token).toBe('string')

    const verified = await verifySupportSession(token)
    expect(verified.superAdminId).toBe(payload.superAdminId)
    expect(verified.targetOrgId).toBe(payload.targetOrgId)
  })

  it('rejects a tampered token', async () => {
    const token = await signSupportSession(payload)
    const tampered = token.slice(0, -5) + 'XXXXX'
    await expect(verifySupportSession(tampered)).rejects.toThrow()
  })
})

describe('getSupportSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no cookie is present', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    const session = await getSupportSession()
    expect(session).toBeNull()
  })

  it('returns null when cookie contains an invalid token', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'invalid.jwt.token' })
    const session = await getSupportSession()
    expect(session).toBeNull()
  })

  it('returns the session when cookie contains a valid token', async () => {
    const payload = {
      superAdminId: 'sa-42',
      targetOrgId: 'org-99',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    const token = await signSupportSession(payload)
    mockCookieStore.get.mockReturnValue({ value: token })

    const session = await getSupportSession()
    expect(session?.superAdminId).toBe('sa-42')
    expect(session?.targetOrgId).toBe('org-99')
  })
})
