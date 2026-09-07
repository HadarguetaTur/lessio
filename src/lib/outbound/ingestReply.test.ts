import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingClient } from '@/test/supabase'
import type { Prospect } from './types'

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

const mockUpsertLead = vi.fn()
const mockAddLeadEvent = vi.fn()
const mockMarkLeadLost = vi.fn()
vi.mock('./leads', () => ({
  upsertLeadFromProspect: (...args: unknown[]) => mockUpsertLead(...args),
  addLeadEvent: (...args: unknown[]) => mockAddLeadEvent(...args),
  markLeadLost: (...args: unknown[]) => mockMarkLeadLost(...args),
}))

const mockSendDemo = vi.fn()
vi.mock('./demoEmail', () => ({
  sendDemoEmailOnce: (...args: unknown[]) => mockSendDemo(...args),
}))

const mockAddSuppression = vi.fn()
vi.mock('./suppressions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./suppressions')>()
  return { ...actual, addSuppression: (...args: unknown[]) => mockAddSuppression(...args) }
})

import { ingestReply } from './ingestReply'

const prospect: Prospect = {
  id: 'p1', campaign_id: 'c1', email: 'dana@example.com', first_name: 'דנה', last_name: null, company: null,
  phone: null, locale: 'he', personal_line: null, subject_area: null, source_url: null, metadata: {},
  status: 'sent', send_attempts: 1, claimed_at: null, sent_at: '2026-09-07T08:00:00Z', replied_at: null,
  last_reply_class: null, platform_lead_id: null, demo_email_sent_at: null, import_batch_id: null, notes: null,
  created_at: '', updated_at: '',
}

const base = { fromEmail: 'Dana@Example.com', subject: 'Re: hi', transportMessageId: 'm-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsertLead.mockResolvedValue({ leadId: 'lead-1', created: true })
  mockSendDemo.mockResolvedValue('sent')
  mockAddSuppression.mockResolvedValue({ ok: true, created: true })
})

describe('ingestReply', () => {
  it('stops on a duplicate transport message id', async () => {
    const db = recordingClient({ error: { message: 'dup', code: '23505' } as never })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'כן' })
    expect(r).toEqual({ duplicate: true })
    expect(db.tables()).toEqual(['outbound_messages'])
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
    expect(mockAddLeadEvent).toHaveBeenCalledWith('lead-1', 'demo_email', expect.anything())
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

  it('an unsubscribe on an existing lead marks it lost', async () => {
    const db = recordingClient({
      data: {
        outbound_messages: { id: 'msg-1' },
        outbound_prospects: { ...prospect, status: 'interested', platform_lead_id: 'lead-1' },
      },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'תסירו אותי' })
    expect(r).toMatchObject({ classification: 'unsubscribe', status: 'unsubscribed' })
    expect(mockMarkLeadLost).toHaveBeenCalledWith('lead-1', 'unsubscribed')
  })

  it('an auto-reply is logged and moves nothing', async () => {
    const db = recordingClient({
      data: { outbound_messages: { id: 'msg-1' }, outbound_prospects: prospect },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await ingestReply({ ...base, bodyText: 'I am out of the office until Monday.' })
    expect(r).toMatchObject({ classification: 'auto_reply', status: 'sent', moved: false })
    expect(mockAddSuppression).not.toHaveBeenCalled()
    expect(mockUpsertLead).not.toHaveBeenCalled()
  })
})
