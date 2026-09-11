import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A recording client shaped for updateLeadStatus: reads answer per table,
 * every write is captured with the filters that scoped it.
 */
type Write = { table: string; op: 'update' | 'insert'; payload: unknown; filters: Record<string, unknown> }

function fakeDb(reads: Record<string, unknown>) {
  const writes: Write[] = []
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let pending: Write | null = null
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      const filter = (m: string) => (col: string, val: unknown) => {
        filters[`${m}:${col}`] = val
        return builder
      }
      Object.assign(builder, {
        select: chain,
        order: chain,
        limit: chain,
        eq: filter('eq'),
        in: filter('in'),
        is: filter('is'),
        update: (payload: unknown) => {
          pending = { table, op: 'update', payload, filters }
          writes.push(pending)
          return builder
        },
        insert: (payload: unknown) => {
          writes.push({ table, op: 'insert', payload, filters })
          return builder
        },
        maybeSingle: async () => ({ data: reads[table] ?? null, error: null }),
        single: async () => ({ data: reads[table] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      })
      return builder
    },
  }
  return {
    client,
    writes,
    updates: (table: string) => writes.filter((w) => w.table === table && w.op === 'update'),
    inserts: (table: string) => writes.filter((w) => w.table === table && w.op === 'insert'),
  }
}

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

import { updateLeadStatus } from './leads'

beforeEach(() => vi.clearAllMocks())

describe('updateLeadStatus', () => {
  it('refuses "lost" without a reason before touching the database', async () => {
    const db = fakeDb({})
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await updateLeadStatus({ leadId: 'l1', status: 'lost', actorProfileId: 'me', lostReason: '  ' })
    expect(r).toEqual({ ok: false, error: 'LOST_REASON_REQUIRED' })
    expect(db.writes).toEqual([])
  })

  it('answers NOT_FOUND for an unknown lead', async () => {
    const db = fakeDb({ platform_leads: null })
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    expect(await updateLeadStatus({ leadId: 'nope', status: 'contacted', actorProfileId: 'me' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    })
  })

  it('a human taking over stops the follow-ups and marks the replies read', async () => {
    const db = fakeDb({ platform_leads: { id: 'l1', status: 'new', prospect_id: 'p1' } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await updateLeadStatus({ leadId: 'l1', status: 'contacted', actorProfileId: 'me' })
    expect(r).toEqual({ ok: true, previous: 'new', prospectConverted: false })

    const lead = db.updates('platform_leads')[0]!
    expect(lead.payload).toMatchObject({ status: 'contacted', lost_reason: null })
    expect(lead.payload).not.toHaveProperty('converted_at')

    const prospect = db.updates('outbound_prospects')[0]!
    expect(prospect.payload).toEqual({ next_followup_at: null, followup_claimed_at: null })
    expect(prospect.filters).toMatchObject({ 'eq:id': 'p1' })

    const reviewed = db.updates('outbound_messages')[0]!
    expect(reviewed.payload).toHaveProperty('reviewed_at')
    expect(reviewed.filters).toMatchObject({ 'eq:prospect_id': 'p1', 'eq:direction': 'in', 'is:reviewed_at': null })

    const event = db.inserts('platform_lead_events')[0]!
    expect(event.payload).toMatchObject({ lead_id: 'l1', type: 'status_change', payload: { from: 'new', to: 'contacted' } })
  })

  it('winning converts the prospect and stamps the lead', async () => {
    const db = fakeDb({
      platform_leads: { id: 'l1', status: 'qualified', prospect_id: 'p1' },
      outbound_prospects: { status: 'interested' },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await updateLeadStatus({ leadId: 'l1', status: 'won', actorProfileId: 'me' })
    expect(r).toMatchObject({ ok: true, previous: 'qualified', prospectConverted: true })
    expect(db.updates('platform_leads')[0]!.payload).toMatchObject({ status: 'won', next_action_at: null })
    expect(db.updates('platform_leads')[0]!.payload).toHaveProperty('converted_at')
    expect(db.updates('outbound_prospects')[0]!.payload).toMatchObject({ status: 'converted', next_followup_at: null })
  })

  it('does not resurrect a prospect who already unsubscribed', async () => {
    const db = fakeDb({
      platform_leads: { id: 'l1', status: 'qualified', prospect_id: 'p1' },
      outbound_prospects: { status: 'unsubscribed' },
    })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await updateLeadStatus({ leadId: 'l1', status: 'trial', actorProfileId: 'me' })
    expect(r).toMatchObject({ ok: true, prospectConverted: false })
    expect(db.updates('outbound_prospects')[0]!.payload).not.toHaveProperty('status')
  })

  it('losing records the reason and clears the reminder', async () => {
    const db = fakeDb({ platform_leads: { id: 'l1', status: 'contacted', prospect_id: null } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    const r = await updateLeadStatus({ leadId: 'l1', status: 'lost', actorProfileId: 'me', lostReason: 'no_budget' })
    expect(r).toMatchObject({ ok: true })
    expect(db.updates('platform_leads')[0]!.payload).toMatchObject({ status: 'lost', lost_reason: 'no_budget', next_action_at: null })
    expect(db.updates('outbound_prospects')).toEqual([]) // no prospect, nothing to stop
    expect(db.inserts('platform_lead_events')[0]!.payload).toMatchObject({ payload: { lostReason: 'no_budget' } })
  })
})
