import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingClient } from '@/test/supabase'
import type { MailboxWithUsage } from './mailboxes'

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

import { getOutboundCockpit } from './stats'

const box = (o: Partial<MailboxWithUsage> = {}): MailboxWithUsage => ({
  id: 'b1',
  email: 'hadar@getlessio.com',
  display_name: null,
  is_active: true,
  daily_cap: 10,
  sentToday: 3,
  last_history_id: null,
  last_polled_at: null,
  last_error: null,
  last_error_at: null,
  created_at: '',
  updated_at: '',
  ...o,
})

beforeEach(() => vi.clearAllMocks())

describe('getOutboundCockpit', () => {
  it('asks only for counts, with the filters that define each number', async () => {
    const db = recordingClient({ count: 4 })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const c = await getOutboundCockpit([box()], new Date('2026-09-09T07:00:00Z')) // 10:00 Israel, Wednesday

    // Head counts: nothing selected but the count. The one exception is the
    // failed-demo query, which returns prospect ids so a person is counted once.
    const demoFailed = db.queries.find((q) => q.filters['eq:kind'] === 'demo_email')!
    for (const q of db.queries) if (q !== demoFailed) expect(q.filters.select).toBe('id')

    const replies = db.queries.find((q) => q.filters['is:reviewed_at'] === null)!
    expect(replies.table).toBe('outbound_messages')
    expect(replies.filters).toMatchObject({ 'eq:direction': 'in', 'in:classification': ['unknown', 'unmatched'] })

    const sentToday = db.queries.find((q) => q.filters['in:kind'])!
    expect(sentToday.filters).toMatchObject({
      'eq:direction': 'out',
      'in:kind': ['cold_email', 'followup', 'demo_email'],
      'is:error': null,
    })

    // A rejected demo whose claim was released and nobody has resent since.
    expect(demoFailed.table).toBe('outbound_messages')
    expect(demoFailed.filters).toMatchObject({
      'eq:direction': 'out',
      'not:error': 'is null',
      'is:prospect.demo_email_sent_at': null,
    })
    expect(String(sentToday.filters['gte:created_at'])).toBe('2026-09-08T21:00:00.000Z') // Israel midnight in UTC

    expect(c.repliesToReview).toBe(4)
    expect(c.sentToday).toBe(4)
  })

  it('reports the sending state from the clock and the pool', async () => {
    const db = recordingClient({ count: 0 })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const inWindow = await getOutboundCockpit([box(), box({ id: 'b2', is_active: false })], new Date('2026-09-09T07:00:00Z'))
    expect(inWindow.sending).toMatchObject({ active: true, nextWindowStart: null, remainingCapacity: 7, activeMailboxes: 1 })

    const evening = await getOutboundCockpit([box()], new Date('2026-09-10T17:00:00Z')) // Thursday 20:00 Israel
    expect(evening.sending.active).toBe(false)
    expect(evening.sending.nextWindowStart).toBe('2026-09-13T05:00:00.000Z') // Sunday 08:00 Israel
  })

  it('lifts mailbox errors straight from the pool, without a query', async () => {
    const db = recordingClient({ count: 0 })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const c = await getOutboundCockpit([box({ last_error: 'invalid_grant', last_error_at: '2026-09-09T06:00:00Z' })], new Date())
    expect(c.mailboxErrors).toEqual([
      { id: 'b1', email: 'hadar@getlessio.com', last_error: 'invalid_grant', last_error_at: '2026-09-09T06:00:00Z' },
    ])
    expect(db.tables()).not.toContain('outbound_mailboxes')
  })

  it('counts each person with a failed demo once, however many attempts failed', async () => {
    const db = recordingClient({
      count: 0,
      data: [{ prospect_id: 'p1' }, { prospect_id: 'p1' }, { prospect_id: 'p2' }],
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const c = await getOutboundCockpit([box()], new Date('2026-09-16T12:00:00Z'))
    expect(c.demoFailed).toBe(2)
  })
})
