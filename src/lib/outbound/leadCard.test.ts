import { describe, expect, it } from 'vitest'
import { mergeTimeline, type LeadEvent } from './leadCard'
import type { OutboundMessage } from './types'

const msg = (id: string, at: string, direction: 'in' | 'out' = 'out'): OutboundMessage => ({
  id,
  prospect_id: 'p1',
  direction,
  kind: direction === 'out' ? 'cold_email' : 'reply',
  mailbox_id: null,
  from_email: null,
  subject: null,
  body: null,
  classification: null,
  error: null,
  reviewed_at: null,
  created_at: at,
})

const ev = (id: string, at: string, type = 'status_change'): LeadEvent => ({
  id,
  type,
  payload: {},
  actor_profile_id: null,
  created_at: at,
})

describe('mergeTimeline', () => {
  it('interleaves messages and human events by time', () => {
    const out = mergeTimeline(
      [msg('m1', '2026-09-07T08:00:00Z'), msg('m2', '2026-09-08T08:00:00Z', 'in')],
      [ev('e1', '2026-09-07T20:00:00Z')]
    )
    expect(out.map((i) => (i.kind === 'message' ? i.message.id : i.event.id))).toEqual(['m1', 'e1', 'm2'])
  })

  it('drops the engine events that are already messages', () => {
    const out = mergeTimeline(
      [msg('m1', '2026-09-07T08:00:00Z')],
      [ev('e1', '2026-09-07T09:00:00Z', 'outbound_reply'), ev('e2', '2026-09-07T09:01:00Z', 'demo_email'), ev('e3', '2026-09-07T09:02:00Z', 'note')]
    )
    expect(out.map((i) => (i.kind === 'message' ? i.message.id : i.event.id))).toEqual(['m1', 'e3'])
  })
})
