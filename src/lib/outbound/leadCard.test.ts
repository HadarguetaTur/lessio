import { describe, expect, it } from 'vitest'
import { lastDemoInThread, mergeTimeline, type LeadEvent } from './leadCard'
import type { OutboundMessage } from './types'

const msg = (id: string, at: string, direction: 'in' | 'out' = 'out', overrides: Partial<OutboundMessage> = {}): OutboundMessage => ({
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
  transport: null,
  transport_message_id: null,
  created_at: at,
  ...overrides,
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

  it('keeps the demo email message, which is where the card shows it', () => {
    const demo = msg('d1', '2026-09-16T11:20:05Z', 'out', { kind: 'demo_email', transport: 'resend' })
    const out = mergeTimeline([msg('m1', '2026-09-16T11:13:56Z'), demo], [ev('e1', '2026-09-16T11:20:05Z', 'demo_email')])
    expect(out.map((i) => (i.kind === 'message' ? i.message.id : i.event.id))).toEqual(['m1', 'd1'])
  })

  it('shows a manual resend as its own event', () => {
    const out = mergeTimeline([], [ev('e1', '2026-09-16T12:00:00Z', 'demo_email_resent')])
    expect(out).toHaveLength(1)
  })
})

describe('lastDemoInThread', () => {
  it('picks the newest outbound demo email and ignores everything else', () => {
    const thread = [
      msg('cold', '2026-09-16T11:13:56Z'),
      msg('d-old', '2026-09-16T11:20:05Z', 'out', { kind: 'demo_email', error: 'validation_error: domain not verified' }),
      msg('reply', '2026-09-16T11:30:00Z', 'in'),
      msg('d-new', '2026-09-16T12:00:00Z', 'out', { kind: 'demo_email', transport_message_id: 're_1' }),
    ]
    expect(lastDemoInThread(thread)?.id).toBe('d-new')
  })

  it('is null when no demo was ever sent', () => {
    expect(lastDemoInThread([msg('cold', '2026-09-16T11:13:56Z')])).toBeNull()
  })
})
