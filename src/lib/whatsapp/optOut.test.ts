import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasOptOutIntent,
  hasResumeIntent,
  hasCancellationIntent,
  hasBookingIntent,
} from './parsePayload'
import { hasScheduleIntent, hasBalanceIntent } from './index'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { isOptedOut, setParentOptOut } from './optOut'

describe('hasOptOutIntent', () => {
  it.each(['stop', 'STOP', 'Stop.', ' unsubscribe ', 'opt out', 'הסר', 'הפסק', 'עצור'])(
    'matches %j sent on its own',
    (text) => {
      expect(hasOptOutIntent(text)).toBe(true)
    }
  )

  // The whole point of anchoring: "stop" is a common word inside real sentences,
  // and unsubscribing someone who was mid-conversation is the worse failure.
  it.each([
    'stop sending me the 8am one, the evening reminder is fine',
    'can you stop the lesson at 5?',
    'please stop by tomorrow',
    'לא הצלחתי להפסיק את ההודעות בהגדרות',
  ])('does not match %j', (text) => {
    expect(hasOptOutIntent(text)).toBe(false)
  })

  it('does not collide with the other parent intents', () => {
    expect(hasCancellationIntent('stop')).toBe(false)
    expect(hasBookingIntent('stop')).toBe(false)
    expect(hasScheduleIntent('stop')).toBe(false)
    expect(hasBalanceIntent('stop')).toBe(false)
  })
})

describe('hasResumeIntent', () => {
  it.each(['start', 'START', 'resume', 'subscribe', 'התחל', 'המשך'])('matches %j', (text) => {
    expect(hasResumeIntent(text)).toBe(true)
  })

  it.each(['start the lesson earlier please', 'when do we start?'])(
    'does not match %j',
    (text) => {
      expect(hasResumeIntent(text)).toBe(false)
    }
  )
})

function mockParentsSelect(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  mockCreateServiceRoleClient.mockReturnValue({ from: vi.fn(() => query) })
  return query
}

function mockParentsUpdate(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(result),
  }
  mockCreateServiceRoleClient.mockReturnValue({ from: vi.fn(() => query) })
  return query
}

describe('isOptedOut', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is true when opted_out_at is set', async () => {
    mockParentsSelect({ data: { opted_out_at: '2026-08-17T09:00:00Z' }, error: null })
    expect(await isOptedOut('org-1', '+972501234567')).toBe(true)
  })

  it('is false when opted_out_at is null', async () => {
    mockParentsSelect({ data: { opted_out_at: null }, error: null })
    expect(await isOptedOut('org-1', '+972501234567')).toBe(false)
  })

  it('is false when the phone is not a parent in this org', async () => {
    mockParentsSelect({ data: null, error: null })
    expect(await isOptedOut('org-1', '+972501234567')).toBe(false)
  })

  it('scopes the lookup to the org, so the same phone in another org is unaffected', async () => {
    const query = mockParentsSelect({ data: null, error: null })
    await isOptedOut('org-1', '+972501234567')
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(query.eq).toHaveBeenCalledWith('phone', '+972501234567')
  })

  // Fails open on purpose: a transient DB error must not become a silent
  // messaging blackout across every org.
  it('allows the send when the lookup errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockParentsSelect({ data: null, error: { message: 'connection reset' } })

    expect(await isOptedOut('org-1', '+972501234567')).toBe(false)
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})

describe('setParentOptOut', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stamps a timestamp when opting out', async () => {
    const query = mockParentsUpdate({ data: [{ id: 'p-1' }], error: null })

    expect(await setParentOptOut('org-1', '+972501234567', true)).toBe(true)
    expect(query.update).toHaveBeenCalledWith({ opted_out_at: expect.any(String) })
  })

  it('clears the timestamp when opting back in', async () => {
    const query = mockParentsUpdate({ data: [{ id: 'p-1' }], error: null })

    expect(await setParentOptOut('org-1', '+972501234567', false)).toBe(true)
    expect(query.update).toHaveBeenCalledWith({ opted_out_at: null })
  })

  it('reports false when no parent matched', async () => {
    mockParentsUpdate({ data: [], error: null })
    expect(await setParentOptOut('org-1', '+972509999999', true)).toBe(false)
  })

  it('reports false when the update fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockParentsUpdate({ data: null, error: { message: 'permission denied' } })

    expect(await setParentOptOut('org-1', '+972501234567', true)).toBe(false)

    errorSpy.mockRestore()
  })
})
