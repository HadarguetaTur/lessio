/**
 * Unit tests for the WhatsApp support session — Sprint 32 M2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  startSupportSession,
  setSupportDraft,
  getActiveSupportSession,
  deleteSupportSession,
} from './supportSessions'

type Spy = (...args: unknown[]) => unknown

function chain(result: unknown, spies: Record<string, Spy> = {}) {
  const c: Record<string, unknown> = {}
  ;['select', 'eq', 'gt', 'update', 'delete', 'upsert'].forEach((m) => {
    c[m] = (...args: unknown[]) => {
      spies[m]?.(...args)
      return c
    }
  })
  c['maybeSingle'] = () => Promise.resolve(result)
  c['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

beforeEach(() => vi.clearAllMocks())

describe('startSupportSession()', () => {
  it('upserts on (organization_id, phone) so a second tap replaces the first', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ upsert }) })

    await startSupportSession('org-1', '+972501234567')

    const [row, opts] = upsert.mock.calls[0]
    expect(row).toMatchObject({
      organization_id: 'org-1',
      phone: '+972501234567',
      step: 'awaiting_description',
      draft_text: null,
    })
    expect(opts).toEqual({ onConflict: 'organization_id,phone' })
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws when the upsert fails, so the caller does not prompt into a void', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ upsert: vi.fn().mockResolvedValue({ error: { message: 'db down' } }) }),
    })

    await expect(startSupportSession('org-1', '+972501234567')).rejects.toThrow('db down')
  })
})

describe('setSupportDraft()', () => {
  it('moves to awaiting_confirm and extends the expiry', async () => {
    const update = vi.fn()
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => chain({ error: null }, { update }),
    })

    await setSupportDraft('org-1', '+972501234567', 'the payment button does nothing')

    const [patch] = update.mock.calls[0]
    expect(patch).toMatchObject({
      step: 'awaiting_confirm',
      draft_text: 'the payment button does nothing',
    })
    expect(new Date(patch.expires_at).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('getActiveSupportSession()', () => {
  it('filters out expired rows at read time', async () => {
    const gt = vi.fn()
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => chain({ data: null, error: null }, { gt }),
    })

    await expect(getActiveSupportSession('org-1', '+972501234567')).resolves.toBeNull()
    expect(gt).toHaveBeenCalledWith('expires_at', expect.any(String))
  })

  it('returns the session when one is live', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () =>
        chain({
          data: {
            id: 's1',
            organization_id: 'org-1',
            phone: '+972501234567',
            step: 'awaiting_confirm',
            draft_text: 'draft',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
          error: null,
        }),
    })

    const session = await getActiveSupportSession('org-1', '+972501234567')
    expect(session).toMatchObject({ step: 'awaiting_confirm', draft_text: 'draft' })
  })
})

describe('deleteSupportSession()', () => {
  it('scopes the delete to the org and phone', async () => {
    const eq = vi.fn()
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => chain({ error: null }, { eq }),
    })

    await deleteSupportSession('org-1', '+972501234567')

    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(eq).toHaveBeenCalledWith('phone', '+972501234567')
  })
})
