/**
 * The parent portal had no logout at all — clearPortalSessionCookie had zero
 * callers — on a product whose login model is a shared family phone and whose
 * session cookie lasts seven days.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClear, mockGetPortalSession, mockRedirect } = vi.hoisted(() => ({
  mockClear: vi.fn(),
  mockGetPortalSession: vi.fn(),
  mockRedirect: vi.fn(() => {
    // next/navigation's redirect signals by throwing; mirror that so the test
    // proves nothing runs after it.
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('@/lib/portal/session', () => ({
  clearPortalSessionCookie: mockClear,
  getPortalSession: mockGetPortalSession,
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/superadmin/dataDeletion', () => ({ createDeletionRequest: vi.fn() }))

import { portalLogoutAction } from './actions'

beforeEach(() => vi.clearAllMocks())

describe('portalLogoutAction', () => {
  it('clears the session cookie and sends the parent to the login screen', async () => {
    mockGetPortalSession.mockResolvedValue({ parentId: 'p1', orgId: 'org-a' })

    await expect(portalLogoutAction('org-a')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockClear).toHaveBeenCalledOnce()
    expect(mockRedirect).toHaveBeenCalledWith('/portal/org-a/login')
  })

  it('clears the cookie even when no valid session remains', async () => {
    // An expired or foreign cookie is exactly when a parent reaches for
    // "log out". Refusing to clear it because it looks wrong is backwards.
    mockGetPortalSession.mockResolvedValue(null)

    await expect(portalLogoutAction('org-a')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('clears before redirecting, not after', async () => {
    mockGetPortalSession.mockResolvedValue({ parentId: 'p1', orgId: 'org-a' })

    await portalLogoutAction('org-a').catch(() => {})

    expect(mockClear.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedirect.mock.invocationCallOrder[0]
    )
  })
})
