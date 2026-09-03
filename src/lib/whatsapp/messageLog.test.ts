import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { logInboundMessage, logOutboundMessage, recordOutboundSend } from './messageLog'
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
