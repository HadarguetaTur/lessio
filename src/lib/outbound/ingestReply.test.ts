import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingClient } from '@/test/supabase'
import { makeProspect } from './testFixtures'

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

const mockUpsertLead = vi.fn()
const mockAddLeadEvent = vi.fn()
vi.mock('./leads', () => ({
  upsertLeadFromProspect: (...args: unknown[]) => mockUpsertLead(...args),
  addLeadEvent: (...args: unknown[]) => mockAddLeadEvent(...args),
  markLeadLost: vi.fn(),
}))

const mockSendDemo = vi.fn()
vi.mock('./demoEmail', () => ({
  sendDemoEmailOnce: (...args: unknown[]) => mockSendDemo(...args),
}))

const mockAddSuppression = vi.fn()
const mockIsSuppressed = vi.fn()
vi.mock('./suppressions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./suppressions')>()
  return {
    ...actual,
    addSuppression: (...args: unknown[]) => mockAddSuppression(...args),
    isSuppressed: (...args: unknown[]) => mockIsSuppressed(...args),
  }
})

const mockErase = vi.fn()
vi.mock('./unsubscribe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./unsubscribe')>()
  return { ...actual, eraseProspectByEmail: (...args: unknown[]) => mockErase(...args) }
})

import { ingestReply } from './ingestReply'

const prospect = makeProspect()
const base = { fromEmail: 'Dana@Example.com', subject: 'Re: hi', transportMessageId: 'm-1' }

/** The prospect update the code issued, whatever order the queries ran in. */
function prospectUpdate(db: ReturnType<typeof recordingClient>): Record<string, unknown> {
  const q = db.queries.filter((x) => x.table === 'outbound_prospects' && 'update' in x.filters).at(-1)
  return (q?.filters.update ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsSuppressed.mockResolvedValue(false)
  mockUpsertLead.mockResolvedValue({ leadId: 'lead-1', created: true })
  mockSendDemo.mockResolvedValue('sent')
  mockAddSuppression.mockResolvedValue({ ok: true, created: true })
  mockErase.mockResolvedValue({ email: 'dana@example.com', leads: 1, messages: 2, prospects: 1 })
})

describe('ingestReply', () => {
  it('stops on a duplicate transport message id', async () => {
    const db = recordingClient({ error: { message: 'dup', code: '23505' } as never })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'כן' })
    expect(r).toEqual({ duplicate: true })
    expect(db.tables()).toEqual(['outbound_messages'])
  })

  it('stores nothing at all for someone who already asked out', async () => {
    mockIsSuppressed.mockResolvedValue(true)
    const db = recordingClient({ data: { outbound_messages: { id: 'msg-1' } } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'anything' })
    expect(r).toEqual({ duplicate: false, suppressed: true })
    expect(db.tables()).toEqual([])
  })

  it('keeps an unmatched reply and never touches a prospect', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: null },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'כן' })
    expect(r).toMatchObject({ duplicate: false, matched: false, classification: 'unmatched' })
    expect(db.filters('outbound_prospects')).toMatchObject({ 'eq:email': 'dana@example.com' })
    expect(mockUpsertLead).not.toHaveBeenCalled()
  })

  it('stores the reply Message-ID so a follow-up can thread onto it', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: prospect },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await ingestReply({ ...base, bodyText: 'כן', rfcMessageId: '<abc@mail.gmail.com>' })
    expect(db.filters('outbound_messages')).toMatchObject({
      insert: expect.objectContaining({ rfc_message_id: '<abc@mail.gmail.com>' }),
    })
  })

  it('a positive reply creates the lead and sends the demo email', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: prospect, outbound_campaigns: { name: 'Sept' } },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'כן, מעניין אותי\n\nOn Mon wrote:\n> דמו?' })
    expect(r).toMatchObject({
      matched: true,
      classification: 'interested',
      status: 'interested',
      moved: true,
      leadId: 'lead-1',
      demoEmail: 'sent',
    })
    expect(mockUpsertLead).toHaveBeenCalledWith(prospect, { campaignName: 'Sept' })
    expect(mockSendDemo).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', status: 'interested' }))
    expect(mockAddLeadEvent).toHaveBeenCalledWith('lead-1', 'outbound_reply', expect.objectContaining({ snippet: 'כן, מעניין אותי' }))
    expect(mockAddSuppression).not.toHaveBeenCalled()
  })

  it('a negative reply suppresses the address', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: prospect },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'לא תודה' })
    expect(r).toMatchObject({ classification: 'not_interested', status: 'not_interested' })
    expect(mockAddSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'dana@example.com', reason: 'replied_negative' })
    )
    expect(mockSendDemo).not.toHaveBeenCalled()
  })

  it('an unsubscribe erases the person rather than flagging them', async () => {
    const db = recordingClient({
      data: {
        outbound_messages: { id: 'msg-1' },
        outbound_prospects: { ...prospect, status: 'interested', platform_lead_id: 'lead-1' },
      },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'תסירי אותי' })
    expect(r).toMatchObject({ classification: 'unsubscribe', status: 'unsubscribed' })
    expect(mockErase).toHaveBeenCalledWith('dana@example.com', 'reply:msg-1')
    expect(mockAddSuppression).not.toHaveBeenCalled()
  })

  it('an unreadable reply schedules one clarification', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: prospect },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'מי אתם?' })
    expect(r).toMatchObject({ classification: 'unknown', status: 'replied' })

    const update = prospectUpdate(db)
    expect(update.last_inbound_at).toBeTruthy()
    expect(update.followup_stage).toBe(0)
    const due = new Date(String(update.next_followup_at)).getTime() - Date.now()
    expect(due).toBeGreaterThan(1.9 * 24 * 3600 * 1000)
    expect(due).toBeLessThan(2.1 * 24 * 3600 * 1000)
  })

  it('a real reply cancels a pending follow-up', async () => {
    const db = recordingClient({
      data: {
        outbound_messages: { id: 'msg-1' },
        outbound_prospects: { ...prospect, status: 'interested', next_followup_at: '2026-09-20T00:00:00Z' },
      },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await ingestReply({ ...base, bodyText: 'לא תודה' })
    expect(prospectUpdate(db)).toMatchObject({ next_followup_at: null, followup_claimed_at: null })
  })

  it('an auto-reply is logged, moves nothing and cancels nothing', async () => {
    const db = recordingClient({
      data: {
        outbound_messages: { id: 'msg-1' },
        outbound_prospects: { ...prospect, status: 'interested', next_followup_at: '2026-09-20T00:00:00Z' },
      },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'I am out of the office until Monday.' })
    expect(r).toMatchObject({ classification: 'auto_reply', status: 'interested', moved: false })
    expect(db.queries.some((q) => q.table === 'outbound_prospects' && 'update' in q.filters)).toBe(false)
    expect(mockAddSuppression).not.toHaveBeenCalled()
    expect(mockUpsertLead).not.toHaveBeenCalled()
  })
})
