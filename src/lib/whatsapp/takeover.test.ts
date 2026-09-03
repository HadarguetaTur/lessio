import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  TAKEOVER_DURATION_HOURS,
  getTakeover,
  isTakenOver,
  releaseTakeover,
  setTakeover,
} from './takeover'

/** A select chain ending in maybeSingle(), plus a delete chain to assert on. */
function mockLookup(result: { data: unknown; error?: { message: string } | null }) {
  const deleteChain: Record<string, unknown> = {}
  deleteChain.eq = () => deleteChain
  deleteChain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve)

  const deleteFn = vi.fn(() => deleteChain)

  mockCreateServiceRoleClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ error: null, ...result }),
          }),
        }),
      }),
      delete: deleteFn,
    }),
  })

  return { deleteFn }
}

const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const anHourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

describe('getTakeover()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a live takeover', async () => {
    mockLookup({
      data: { phone: '+972501234567', taken_by_profile_id: 'profile-1', expires_at: inTwoHours() },
    })

    const takeover = await getTakeover('org-1', '+972501234567')

    expect(takeover).not.toBeNull()
    expect(takeover?.takenByProfileId).toBe('profile-1')
  })

  it('treats an expired row as no takeover and cleans it up', async () => {
    const { deleteFn } = mockLookup({
      data: { phone: '+972501234567', taken_by_profile_id: 'profile-1', expires_at: anHourAgo() },
    })

    expect(await getTakeover('org-1', '+972501234567')).toBeNull()
    expect(deleteFn).toHaveBeenCalled()
  })

  it('returns null when no row exists', async () => {
    mockLookup({ data: null })
    expect(await getTakeover('org-1', '+972501234567')).toBeNull()
  })

  it('fails open on a DB error, so a broken query never silences the bot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLookup({ data: null, error: { message: 'db down' } })

    expect(await isTakenOver('org-1', '+972501234567')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('setTakeover()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts on (org, phone) with a fresh expiry', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ upsert }) })

    const before = Date.now()
    await setTakeover('org-1', '+972501234567', 'profile-1')

    const [row, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'organization_id,phone' })
    expect(row).toMatchObject({
      organization_id: 'org-1',
      phone: '+972501234567',
      taken_by_profile_id: 'profile-1',
    })

    const expiresIn = new Date(row.expires_at).getTime() - before
    expect(expiresIn).toBeGreaterThan((TAKEOVER_DURATION_HOURS - 0.1) * 60 * 60 * 1000)
    expect(expiresIn).toBeLessThanOrEqual(TAKEOVER_DURATION_HOURS * 60 * 60 * 1000 + 1000)
  })

  it('logs but never throws when the upsert fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ upsert: vi.fn().mockResolvedValue({ error: { message: 'db down' } }) }),
    })

    await expect(setTakeover('org-1', '+972501234567', 'profile-1')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('releaseTakeover()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the row for this conversation only', async () => {
    const eq = vi.fn()
    const chain: Record<string, unknown> = {}
    chain.eq = (...args: unknown[]) => {
      eq(...args)
      return chain
    }
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)

    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ delete: () => chain }) })

    await releaseTakeover('org-1', '+972501234567')

    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(eq).toHaveBeenCalledWith('phone', '+972501234567')
  })
})
