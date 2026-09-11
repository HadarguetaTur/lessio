import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { countByStatus, leadAttention, rankLeads } from './leadInbox'
import type { LeadListItem } from './leads'
import { makeLead } from './testFixtures'

const NOW = DateTime.fromISO('2026-09-10T10:00:00Z')

function item(overrides: Partial<LeadListItem> = {}): LeadListItem {
  return { ...makeLead(), prospect: null, lastInbound: null, ...overrides }
}

describe('leadAttention', () => {
  it('a reminder that came due outranks everything', () => {
    const lead = item({ status: 'contacted', next_action_at: '2026-09-10T09:59:00Z' })
    expect(leadAttention(lead, NOW)).toBe('next_action_due')
  })

  it('a reminder exactly now is due', () => {
    expect(leadAttention(item({ status: 'contacted', next_action_at: NOW.toISO()! }), NOW)).toBe('next_action_due')
  })

  it('a reminder in the future is not', () => {
    expect(leadAttention(item({ status: 'contacted', next_action_at: '2026-09-11T09:00:00Z' }), NOW)).toBe('none')
  })

  it('new leads need a first look', () => {
    expect(leadAttention(item({ status: 'new' }), NOW)).toBe('new')
  })

  it('someone who wrote after the last touch is waiting', () => {
    const lead = item({
      status: 'contacted',
      updated_at: '2026-09-09T10:00:00Z',
      lastInbound: { body: 'כן', created_at: '2026-09-09T12:00:00Z', classification: 'interested' },
    })
    expect(leadAttention(lead, NOW)).toBe('unanswered_reply')
  })

  it('a reply already answered by a later touch is quiet', () => {
    const lead = item({
      status: 'contacted',
      updated_at: '2026-09-09T13:00:00Z',
      lastInbound: { body: 'כן', created_at: '2026-09-09T12:00:00Z', classification: 'interested' },
    })
    expect(leadAttention(lead, NOW)).toBe('none')
  })

  it('a closed lead never surfaces, even with a due reminder', () => {
    expect(leadAttention(item({ status: 'lost', next_action_at: '2026-09-01T00:00:00Z' }), NOW)).toBe('none')
    expect(leadAttention(item({ status: 'won', next_action_at: '2026-09-01T00:00:00Z' }), NOW)).toBe('none')
  })
})

describe('rankLeads', () => {
  it('orders by what it costs to ignore, then keeps input order for ties', () => {
    const quiet = item({ id: 'quiet', status: 'contacted', updated_at: '2026-09-01T00:00:00Z' })
    const won = item({ id: 'won', status: 'won', next_action_at: '2026-09-01T00:00:00Z' })
    const fresh = item({ id: 'fresh', status: 'new', created_at: '2026-09-10T09:00:00Z' })
    const older = item({ id: 'older', status: 'new', created_at: '2026-09-09T09:00:00Z' })
    const waiting = item({
      id: 'waiting',
      status: 'contacted',
      updated_at: '2026-09-08T00:00:00Z',
      lastInbound: { body: 'x', created_at: '2026-09-09T00:00:00Z', classification: 'unknown' },
    })
    const dueLater = item({ id: 'dueLater', status: 'qualified', next_action_at: '2026-09-10T09:30:00Z' })
    const dueFirst = item({ id: 'dueFirst', status: 'qualified', next_action_at: '2026-09-09T09:00:00Z' })

    const ranked = rankLeads([quiet, won, fresh, older, waiting, dueLater, dueFirst], NOW).map((l) => l.id)
    expect(ranked).toEqual(['dueFirst', 'dueLater', 'fresh', 'older', 'waiting', 'quiet', 'won'])
  })

  it('is stable', () => {
    const a = item({ id: 'a', status: 'new', created_at: '2026-09-10T09:00:00Z' })
    const b = item({ id: 'b', status: 'new', created_at: '2026-09-10T09:00:00Z' })
    expect(rankLeads([a, b], NOW).map((l) => l.id)).toEqual(['a', 'b'])
    expect(rankLeads([b, a], NOW).map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('countByStatus', () => {
  it('counts every status plus the attention bucket', () => {
    const leads = [
      item({ status: 'new' }),
      item({ status: 'new' }),
      item({ status: 'contacted', next_action_at: '2026-09-01T00:00:00Z' }),
      item({ status: 'lost' }),
    ]
    const counts = countByStatus(leads, NOW)
    expect(counts).toMatchObject({ all: 4, new: 2, contacted: 1, lost: 1, attention: 3, won: 0 })
  })
})
