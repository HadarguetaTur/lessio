import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  applyDeliveryStatus,
  logInboundMessage,
  logOutboundMessage,
  recordOutboundSend,
} from './messageLog'
import { runWithWaLogContext, setWaLogOrigin, bindWaLogTarget } from './logContext'

function mockInsert(result: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(result)
  mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ insert }) })
  return insert
}

/** A Meta send response carrying the id every sender used to discard. */
function metaResponse(id = 'wamid.OUT'): Response {
  return new Response(JSON.stringify({ messages: [{ id }] }), {
    headers: { 'content-type': 'application/json' },
  })
}

/** Lets the void-ed logging work inside recordOutboundSend settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('logInboundMessage()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records the message as received', async () => {
    const insert = mockInsert()

    await logInboundMessage({
      orgId: 'org-1',
      phone: '+972501234567',
      body: 'שלום',
      waMessageId: 'wamid.IN',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        phone: '+972501234567',
        direction: 'in',
        body: 'שלום',
        kind: 'text',
        status: 'received',
        wa_message_id: 'wamid.IN',
      })
    )
  })

  it('logs but never throws when the insert fails — a transcript must not break the bot', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockInsert({ error: { message: 'db down' } })

    await expect(
      logInboundMessage({ orgId: 'org-1', phone: '+972501234567', body: 'hi' })
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('logOutboundMessage()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records who sent it', async () => {
    const insert = mockInsert()

    await logOutboundMessage({
      orgId: 'org-1',
      phone: '+972501234567',
      body: 'on my way',
      origin: 'staff',
      sentByProfileId: 'profile-1',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'out',
        origin: 'staff',
        sent_by_profile_id: 'profile-1',
        status: 'sent',
      })
    )
  })
})

describe('recordOutboundSend()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when no caller declared a context', async () => {
    const insert = mockInsert()

    recordOutboundSend(metaResponse(), 'hello', 'text')
    await flush()

    expect(insert).not.toHaveBeenCalled()
  })

  it('does nothing while the context is unbound — better no row than a guess', async () => {
    const insert = mockInsert()

    runWithWaLogContext({ orgId: null, phone: null, origin: 'bot' }, () => {
      recordOutboundSend(metaResponse(), 'hello', 'text')
    })
    await flush()

    expect(insert).not.toHaveBeenCalled()
  })

  it('logs against the bound conversation, capturing Meta’s message id', async () => {
    const insert = mockInsert()

    await runWithWaLogContext({ orgId: null, phone: null, origin: 'bot' }, async () => {
      bindWaLogTarget('org-1', '+972501234567')
      recordOutboundSend(metaResponse('wamid.ABC'), 'menu', 'interactive')
      await flush()
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        phone: '+972501234567',
        origin: 'bot',
        kind: 'interactive',
        wa_message_id: 'wamid.ABC',
      })
    )
  })

  it('files a reply as AI once the assistant branch relabels the context', async () => {
    const insert = mockInsert()

    await runWithWaLogContext(
      { orgId: 'org-1', phone: '+972501234567', origin: 'bot' },
      async () => {
        setWaLogOrigin('ai')
        recordOutboundSend(metaResponse(), 'an answer', 'text')
        await flush()
      }
    )

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ origin: 'ai' }))
  })

  it('still records the send when the response body is unreadable', async () => {
    const insert = mockInsert()

    await runWithWaLogContext(
      { orgId: 'org-1', phone: '+972501234567', origin: 'cron' },
      async () => {
        recordOutboundSend(new Response('not json'), 'reminder', 'text')
        await flush()
      }
    )

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ wa_message_id: null }))
  })
})

describe('applyDeliveryStatus()', () => {
  beforeEach(() => vi.clearAllMocks())

  /** Captures the filter chain so a test can assert which rows were eligible. */
  function mockUpdate(matched: number, error: { message: string } | null = null) {
    const calls: Record<string, unknown[][]> = {}
    const chain: Record<string, unknown> = {}
    const record = (name: string) => (...args: unknown[]) => {
      ;(calls[name] ??= []).push(args)
      return chain
    }
    for (const m of ['update', 'eq', 'in']) chain[m] = record(m)
    chain.select = vi.fn().mockResolvedValue({
      data: error ? null : Array.from({ length: matched }, (_, i) => ({ id: String(i) })),
      error,
    })
    mockCreateServiceRoleClient.mockReturnValue({ from: () => chain })
    return calls
  }

  it('marks the outbound row delivered, but only while it is still behind', async () => {
    const calls = mockUpdate(1)

    const applied = await applyDeliveryStatus({
      orgId: 'org-1',
      waMessageId: 'wamid.OUT',
      status: 'delivered',
    })

    expect(applied).toBe(true)
    expect(calls.update[0][0]).toEqual(
      expect.objectContaining({ status: 'delivered', error_code: null, error_message: null })
    )
    expect(calls.in[0]).toEqual(['status', ['sent']])
    expect(calls.eq).toEqual(
      expect.arrayContaining([
        ['organization_id', 'org-1'],
        ['wa_message_id', 'wamid.OUT'],
        ['direction', 'out'],
      ])
    )
  })

  it('lets a late "delivered" lose to an earlier "read" — statuses never move backwards', async () => {
    const calls = mockUpdate(0)

    const applied = await applyDeliveryStatus({
      orgId: 'org-1',
      waMessageId: 'wamid.OUT',
      status: 'delivered',
    })

    expect(applied).toBe(false)
    expect(calls.in[0][1] as string[]).not.toContain('read')
  })

  it('keeps the Meta error on a failure and lets it override any earlier status', async () => {
    const calls = mockUpdate(1)

    await applyDeliveryStatus({
      orgId: 'org-1',
      waMessageId: 'wamid.OUT',
      status: 'failed',
      errorCode: 131026,
      errorMessage: 'Message undeliverable',
    })

    expect(calls.update[0][0]).toEqual(
      expect.objectContaining({ status: 'failed', error_code: 131026, error_message: 'Message undeliverable' })
    )
    expect(calls.in[0][1] as string[]).toEqual(['sent', 'delivered', 'read'])
  })

  it('never re-applies "sent" — that is the state the row is born in', async () => {
    const calls = mockUpdate(1)

    const applied = await applyDeliveryStatus({ orgId: 'org-1', waMessageId: 'wamid.OUT', status: 'sent' })

    expect(applied).toBe(false)
    expect(calls.update).toBeUndefined()
  })

  it('logs and returns false when the update fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdate(0, { message: 'db down' })

    await expect(
      applyDeliveryStatus({ orgId: 'org-1', waMessageId: 'wamid.OUT', status: 'read' })
    ).resolves.toBe(false)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
