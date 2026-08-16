import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRedirect,
  mockRequireFeature,
  mockCreateServiceRoleClient,
  mockVerifyOtp,
  mockSetPortalSessionCookie,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockRequireFeature: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockSetPortalSessionCookie: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/lib/saas/featureGate', () => ({
  requireFeature: mockRequireFeature,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/portal/otp', () => ({
  verifyOtp: mockVerifyOtp,
  generateOtp: vi.fn(() => '123456'),
  storeOtp: vi.fn(),
  countRecentOtpRequests: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/portal/session', () => ({
  setPortalSessionCookie: mockSetPortalSessionCookie,
}))

vi.mock('@/lib/whatsapp/sendOtp', () => ({ sendOtp: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn(() => 'token') }))

import { verifyOtpAction } from './actions'

/** `parents` lookup returning the given row / error. */
function makeParentsClient(result: {
  data: { id: string } | null
  error: { message: string } | null
}) {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
  })
  return { from: vi.fn(() => ({ select: vi.fn(() => builder) })) }
}

function formData(otp: string) {
  const fd = new FormData()
  fd.set('otp', otp)
  return fd
}

const ORG = 'org-1'
const PHONE = '+972500000000'

describe('verifyOtpAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireFeature.mockResolvedValue(undefined)
  })

  it('signs the parent in and redirects to the portal home', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeParentsClient({ data: { id: 'parent-1' }, error: null })
    )
    mockVerifyOtp.mockResolvedValue(true)

    await verifyOtpAction(ORG, PHONE, { error: null }, formData('123456'))

    expect(mockSetPortalSessionCookie).toHaveBeenCalledWith({ parentId: 'parent-1', orgId: ORG })
    expect(mockRedirect).toHaveBeenCalledWith(`/portal/${ORG}/home`)
  })

  it('does not consume the OTP when the parent lookup fails', async () => {
    // Two `parents` rows on one phone made PostgREST error. The old code called
    // verifyOtp() first, so the code was already burned by the time the lookup blew
    // up — three retries later the parent hit the send limit with no way in.
    mockCreateServiceRoleClient.mockReturnValue(
      makeParentsClient({ data: null, error: { message: 'multiple rows returned' } })
    )

    const state = await verifyOtpAction(ORG, PHONE, { error: null }, formData('123456'))

    expect(state).toEqual({ error: 'generic' })
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockSetPortalSessionCookie).not.toHaveBeenCalled()
  })

  it('does not consume the OTP when no parent matches the phone', async () => {
    mockCreateServiceRoleClient.mockReturnValue(makeParentsClient({ data: null, error: null }))

    const state = await verifyOtpAction(ORG, PHONE, { error: null }, formData('123456'))

    expect(state).toEqual({ error: 'noAccount' })
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('rejects a wrong code without opening a session', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeParentsClient({ data: { id: 'parent-1' }, error: null })
    )
    mockVerifyOtp.mockResolvedValue(false)

    const state = await verifyOtpAction(ORG, PHONE, { error: null }, formData('999999'))

    expect(state).toEqual({ error: 'wrongCode' })
    expect(mockSetPortalSessionCookie).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('rejects a malformed code before touching the database', async () => {
    const state = await verifyOtpAction(ORG, PHONE, { error: null }, formData('12ab'))

    expect(state).toEqual({ error: 'invalidCode' })
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })
})
