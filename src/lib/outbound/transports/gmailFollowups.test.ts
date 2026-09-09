import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeProspect } from '../testFixtures'

const mockSendAsUser = vi.fn()
vi.mock('@/lib/gmail/serviceAccount', () => ({ sendAsUser: (...a: unknown[]) => mockSendAsUser(...a) }))

const mockListMailboxes = vi.fn()
vi.mock('../mailboxes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mailboxes')>()
  return {
    ...actual,
    listMailboxesWithUsage: () => mockListMailboxes(),
    markMailboxError: vi.fn(),
  }
})

vi.mock('@/lib/telemetry/reportError', () => ({
  reportError: vi.fn(),
  describeThrown: (t: unknown) => ({ name: 'Error', message: String(t), stack: null, digest: null }),
}))

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

import { runFollowupBatch } from './gmailFollowups'

const MAILBOX = {
  id: 'box-1',
  email: 'hadar@getlessio.com',
  display_name: 'הדר',
  is_active: true,
  daily_cap: 30,
  sentToday: 0,
  last_history_id: null,
  last_polled_at: null,
  last_error: null,
  last_error_at: null,
  created_at: '',
  updated_at: '',
}

const DUE = makeProspect({
  status: 'interested',
  mailbox_id: 'box-1',
  next_followup_at: '2026-09-08T09:00:00Z',
  followup_stage: 0,
})

/**
 * A fake just rich enough for this run: rpc returns the claimed rows, the
 * three reads answer in the order the code makes them, and every write is
 * recorded for assertions.
 */
function fakeDb(opts: { due?: unknown[]; cold?: unknown; inbound?: unknown; fresh?: unknown } = {}) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const reads = {
    cold: 'cold' in opts ? opts.cold : { subject: 'שאלה על הסטודיו', transport_thread_id: 'thread-1', rfc_message_id: '<cold@mail.gmail.com>' },
    inbound: 'inbound' in opts ? opts.inbound : { rfc_message_id: '<reply@mail.gmail.com>' },
    fresh: 'fresh' in opts ? opts.fresh : { next_followup_at: '2026-09-08T09:00:00Z' },
  }
  let messageRead = 0

  const client = {
    rpc: vi.fn(async () => ({ data: opts.due ?? [DUE], error: null })),
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain, eq: chain, is: chain, order: chain, limit: chain, neq: chain, in: chain,
        insert: (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return builder },
        update: (payload: unknown) => { writes.push({ table, op: 'update', payload }); return builder },
        maybeSingle: async () => {
          if (table === 'outbound_prospects') return { data: reads.fresh, error: null }
          const data = messageRead++ === 0 ? reads.cold : reads.inbound
          return { data, error: null }
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      })
      return builder
    },
  }
  return { client, writes, updates: (t: string) => writes.filter((w) => w.table === t && w.op === 'update').map((w) => w.payload as Record<string, unknown>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListMailboxes.mockResolvedValue([{ ...MAILBOX }])
  mockSendAsUser.mockResolvedValue({ id: 'g-1', threadId: 'thread-1', rfcMessageId: '<new@mail.gmail.com>' })
})

describe('runFollowupBatch', () => {
  it('replies inside the existing conversation and advances the stage', async () => {
    const db = fakeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await runFollowupBatch({ now: new Date('2026-09-08T10:00:00Z'), immediate: true })
    expect(r.sent).toBe(1)

    const sent = mockSendAsUser.mock.calls[0]![0]
    expect(sent).toMatchObject({
      from: 'hadar@getlessio.com',
      to: 'dana@example.com',
      subject: 'Re: שאלה על הסטודיו',
      threadId: 'thread-1',
      inReplyTo: '<reply@mail.gmail.com>',
    })
    expect(sent.references).toEqual(['<cold@mail.gmail.com>', '<reply@mail.gmail.com>'])
    expect(sent.headers['List-Unsubscribe']).toContain(DUE.unsubscribe_token)

    const logged = db.writes.find((w) => w.table === 'outbound_messages')!.payload as Record<string, unknown>
    expect(logged).toMatchObject({ kind: 'followup', direction: 'out', transport_thread_id: 'thread-1' })

    const update = db.updates('outbound_prospects').at(-1)!
    expect(update.followup_stage).toBe(1)
    expect(String(update.next_followup_at)).toContain('2026-09-12') // +4 days
  })

  it('waits rather than sending from a different mailbox when the original is full', async () => {
    mockListMailboxes.mockResolvedValue([{ ...MAILBOX, sentToday: 30 }])
    const db = fakeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await runFollowupBatch({ now: new Date('2026-09-08T10:00:00Z'), immediate: true })
    expect(r.sent).toBe(0)
    expect(r.deferred).toBe(1)
    expect(mockSendAsUser).not.toHaveBeenCalled()
    expect(db.updates('outbound_prospects').at(-1)).toEqual({ followup_claimed_at: null })
  })

  it('stands down when a reply arrived between the claim and the send', async () => {
    const db = fakeDb({ fresh: { next_followup_at: null } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await runFollowupBatch({ now: new Date('2026-09-08T10:00:00Z'), immediate: true })
    expect(r.sent).toBe(0)
    expect(r.deferred).toBe(1)
    expect(mockSendAsUser).not.toHaveBeenCalled()
  })

  it('retires the track when there is no thread to reply into', async () => {
    const db = fakeDb({ cold: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await runFollowupBatch({ now: new Date('2026-09-08T10:00:00Z'), immediate: true })
    expect(r.failed).toBe(1)
    expect(db.updates('outbound_prospects').at(-1)).toMatchObject({ next_followup_at: null })
  })

  it('does nothing outside the working window', async () => {
    const db = fakeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    // Saturday
    const r = await runFollowupBatch({ now: new Date('2026-09-12T10:00:00Z') })
    expect(r.skipped).toBe('outside_window')
    expect(mockSendAsUser).not.toHaveBeenCalled()
  })
})
