/**
 * One Prospect fixture builder for the outbound tests.
 *
 * Not a test suite — a helper for them, so a new column on the table is one
 * edit here rather than one per test file (adding `unsubscribe_token` broke
 * every hand-written fixture at once).
 */

import type { Prospect } from './types'

export function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'p1',
    campaign_id: 'c1',
    email: 'dana@example.com',
    first_name: 'דנה',
    last_name: null,
    company: null,
    phone: null,
    locale: 'he',
    gender: null,
    personal_line: null,
    subject_area: null,
    source_url: null,
    metadata: {},
    status: 'sent',
    send_attempts: 1,
    claimed_at: null,
    sent_at: '2026-09-07T08:00:00Z',
    replied_at: null,
    last_reply_class: null,
    platform_lead_id: null,
    demo_email_sent_at: null,
    import_batch_id: null,
    notes: null,
    mailbox_id: null,
    opener_status: 'none',
    opener_generated: null,
    opener_model: null,
    opener_error: null,
    opener_claimed_at: null,
    unsubscribe_token: 'a'.repeat(32),
    followup_stage: 0,
    next_followup_at: null,
    followup_claimed_at: null,
    followup_attempts: 0,
    last_inbound_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}
