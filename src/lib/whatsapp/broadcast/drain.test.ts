/**
 * The drain, against rows that persist between ticks.
 *
 * Every bug this file exists for is a bug about time passing: a campaign is not
 * a request, it is a queue that drains over hours or days, and consent is a
 * moving target while it does. So these tests run real ticks against a real
 * in-memory table and assert on who actually received a message.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeDb, type FakeDb } from './fakeSupabase'

const { mockCreateServiceRoleClient, mockSendTemplate, mockSendQuickReplies } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockSendTemplate: vi.fn(),
  mockSendQuickReplies: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/crypto', () => ({ decryptToken: () => 'plain-token' }))
vi.mock('@/lib/whatsapp', () => ({ sendTemplateMessage: mockSendTemplate }))
vi.mock('@/lib/whatsapp/interactive', () => ({ sendTemplateWithQuickReplies: mockSendQuickReplies }))
vi.mock('@/lib/whatsapp/logContext', () => ({
  runWithWaLogContext: (_ctx: unknown, fn: () => Promise<void>) => fn(),
}))

import { runBroadcastTick, startCampaign } from './send'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG = 'org-1'
const NOW = new Date('2026-09-09T10:00:00.000Z') // 13:00 in Asia/Jerusalem — inside the window

function orgRow(over: Record<string, unknown> = {}) {
  return {
    id: ORG,
    name: 'Studio',
    timezone: 'Asia/Jerusalem',
    default_locale: 'he',
    whatsapp_phone_number_id: 'pn-1',
    whatsapp_access_token: 'enc',
    wa_quality_rating: 'GREEN',
    // A high tier keeps the daily budget out of the way unless a test wants it.
    wa_messaging_limit_tier: 'TIER_100K',
    wa_business_verification_status: 'verified',
    wa_connected_at: '2026-01-01T00:00:00.000Z',
    wa_health_error: null,
    wa_account_restricted: false,
    broadcasts_enabled: true,
    broadcast_quiet_start: 8,
    broadcast_quiet_end: 21,
    broadcast_max_promo_per_week: 5,
    broadcast_max_updates_per_week: 10,
    ...over,
  }
}

function parentRow(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `p-${n}`,
    organization_id: ORG,
    full_name: `Parent ${n}`,
    phone: `+97250000000${n}`,
    preferred_locale: 'he',
    is_active: true,
    opted_out_at: null,
    updates_opted_out_at: null,
    marketing_opt_in_at: '2026-01-01T00:00:00.000Z',
    marketing_opted_out_at: null,
    welcome_sent_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function campaignRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    organization_id: ORG,
    name: 'Room change',
    template_type: 'class_update',
    topic: 'Guitar',
    message: 'Room 3 this week.',
    audience: { kind: 'manual', parentIds: [] },
    status: 'draft',
    scheduled_at: null,
    student_group_id: null,
    consecutive_failures: 0,
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
    recipients_total: 0,
    started_at: null,
    sent_at: null,
    paused_reason: null,
    ...over,
  }
}

/** Recipients already materialised and queued, as `startCampaign` would leave them. */
function recipients(count: number, over: (n: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      id: `r-${n}`,
      campaign_id: 'c-1',
      organization_id: ORG,
      parent_id: `p-${n}`,
      student_id: null,
      phone: `+97250000000${n}`,
      display_name: `Parent ${n}`,
      locale: 'he',
      status: 'pending',
      skip_reason: null,
      deferred_until: null,
      claimed_at: null,
      sent_at: null,
      created_at: `2026-09-09T09:00:0${n}.000Z`,
      ...over(n),
    }
  })
}

function seed(over: { campaign?: Record<string, unknown>; parents?: Record<string, unknown>[]; recipients?: Record<string, unknown>[]; org?: Record<string, unknown> } = {}) {
  const db = createFakeDb({
    organizations: [orgRow(over.org)],
    parents: over.parents ?? [1, 2, 3, 4].map((n) => parentRow(n)),
    broadcast_campaigns: [campaignRow({ status: 'sending', started_at: NOW.toISOString(), ...over.campaign })],
    broadcast_recipients: over.recipients ?? recipients(4),
    whatsapp_messages: [],
    student_group_invites: [],
  })
  mockCreateServiceRoleClient.mockReturnValue(db)
  return db
}

/** Every phone a template actually went out to, in order. */
function sentPhones(): string[] {
  return [
    ...mockSendQuickReplies.mock.calls.map((c) => c[0] as string),
    ...mockSendTemplate.mock.calls.map((c) => c[0] as string),
  ]
}

const tick = (db: FakeDb, now = NOW) => {
  mockCreateServiceRoleClient.mockReturnValue(db)
  return runBroadcastTick({ now, immediate: true })
}

const recipient = (db: FakeDb, id: string) =>
  db.tables.broadcast_recipients.find((r) => r.id === id)!

const parent = (db: FakeDb, id: string) => db.tables.parents.find((p) => p.id === id)!

beforeEach(() => {
  vi.clearAllMocks()
  mockSendTemplate.mockResolvedValue(undefined)
  mockSendQuickReplies.mockResolvedValue(undefined)
})

// ── Consent at send time ──────────────────────────────────────────────────────

describe('a Stop is honoured at send time, not at materialisation time', () => {
  it('sends to nobody who had already stopped updates before the tick', async () => {
    const db = seed({
      parents: [
        parentRow(1),
        parentRow(2, { updates_opted_out_at: '2026-09-09T09:30:00.000Z' }),
        parentRow(3),
        parentRow(4),
      ],
    })

    await tick(db)

    expect(sentPhones()).toEqual(['+972500000001', '+972500000003', '+972500000004'])
    expect(recipient(db, 'r-2')).toMatchObject({ status: 'skipped', skip_reason: 'updates_opted_out' })
  })

  /**
   * THE one. A campaign of four drains two per tick. Between the ticks a parent
   * taps Stop — their recipient row was materialised before that and says
   * `pending`, which is exactly what the old code trusted. Nothing more from
   * this campaign may reach them.
   */
  it('sends nothing more from a campaign after the parent taps Stop mid-campaign', async () => {
    const db = seed()

    await runBroadcastTick({ now: NOW, immediate: true, batch: 2 })
    expect(sentPhones()).toEqual(['+972500000001', '+972500000002'])

    // The webhook's in-band Stop handler: the category column only, never the
    // global one — a parent leaving the updates list keeps their reminders.
    parent(db, 'p-3').updates_opted_out_at = '2026-09-09T10:05:00.000Z'

    await runBroadcastTick({ now: new Date('2026-09-09T10:10:00.000Z'), immediate: true, batch: 2 })

    expect(sentPhones()).not.toContain('+972500000003')
    expect(sentPhones()).toEqual(['+972500000001', '+972500000002', '+972500000004'])
    expect(recipient(db, 'r-3')).toMatchObject({ status: 'skipped', skip_reason: 'updates_opted_out' })
    // And the parent is still reachable for everything else.
    expect(parent(db, 'p-3').opted_out_at).toBeNull()
  })

  it('honours a Stop that arrives during the overnight pause of a capped campaign', async () => {
    // A warm-up number: the guard caps this campaign at 50, so a fifth recipient
    // would be deferred. Force the same shape with a tiny daily budget instead.
    const db = seed({
      org: orgRow({ wa_messaging_limit_tier: 'TIER_250', wa_connected_at: '2026-01-01T00:00:00.000Z' }),
      recipients: recipients(4, (n) =>
        n > 2
          ? { status: 'deferred', deferred_until: '2026-09-10T05:00:00.000Z' }
          : {}
      ),
    })

    await tick(db)
    expect(sentPhones()).toEqual(['+972500000001', '+972500000002'])

    // Overnight, parent 3 stops updates.
    parent(db, 'p-3').updates_opted_out_at = '2026-09-09T22:00:00.000Z'

    // Next morning the remainder is promoted and drained.
    const tomorrow = new Date('2026-09-10T06:00:00.000Z') // 09:00 local
    const result = await tick(db, tomorrow)

    expect(result.promoted).toBe(2)
    expect(sentPhones()).not.toContain('+972500000003')
    expect(recipient(db, 'r-3')).toMatchObject({ status: 'skipped', skip_reason: 'updates_opted_out' })
    expect(recipient(db, 'r-4')).toMatchObject({ status: 'sent' })
  })

  it('honours the global opt-out for every category', async () => {
    const db = seed({
      parents: [parentRow(1, { opted_out_at: '2026-09-08T00:00:00.000Z' }), parentRow(2), parentRow(3), parentRow(4)],
    })

    await tick(db)

    expect(sentPhones()).not.toContain('+972500000001')
    expect(recipient(db, 'r-1')).toMatchObject({ status: 'skipped', skip_reason: 'opted_out' })
  })

  it('does not let a marketing opt-out block a class update', async () => {
    const db = seed({
      parents: [1, 2, 3, 4].map((n) => parentRow(n, { marketing_opted_out_at: '2026-09-08T00:00:00.000Z' })),
    })

    await tick(db)

    expect(sentPhones()).toHaveLength(4)
  })

  it('does not let an updates opt-out block a promo the parent opted into', async () => {
    const db = seed({
      campaign: { template_type: 'promo' },
      parents: [1, 2, 3, 4].map((n) => parentRow(n, { updates_opted_out_at: '2026-09-08T00:00:00.000Z' })),
    })

    await tick(db)

    expect(sentPhones()).toHaveLength(4)
  })

  it('refuses a promo to a parent with no marketing opt-in on file', async () => {
    const db = seed({
      campaign: { template_type: 'promo' },
      parents: [parentRow(1, { marketing_opt_in_at: null }), parentRow(2), parentRow(3), parentRow(4)],
    })

    await tick(db)

    expect(recipient(db, 'r-1')).toMatchObject({ status: 'skipped', skip_reason: 'no_marketing_opt_in' })
    expect(sentPhones()).not.toContain('+972500000001')
  })
})

// ── The queue ────────────────────────────────────────────────────────────────

describe('the queue', () => {
  it('sends each recipient exactly once across two overlapping workers', async () => {
    const db = seed({ recipients: recipients(6) })

    // Both ticks are started before either finishes — the claim is what keeps
    // them apart, and it is the RPC that does it, not the caller.
    await Promise.all([
      runBroadcastTick({ now: NOW, immediate: true, batch: 6 }),
      runBroadcastTick({ now: NOW, immediate: true, batch: 6 }),
    ])

    const phones = sentPhones()
    expect(phones).toHaveLength(6)
    expect(new Set(phones).size).toBe(6)
  })

  it('leaves a campaign whose recipients are all done marked sent', async () => {
    const db = seed()
    await tick(db)
    expect(db.tables.broadcast_campaigns[0]).toMatchObject({ status: 'sent' })
  })

  it('does not call a campaign sent while a deferred remainder is still waiting', async () => {
    const db = seed({
      recipients: recipients(4, (n) =>
        n > 2 ? { status: 'deferred', deferred_until: '2026-09-11T05:00:00.000Z' } : {}
      ),
    })

    await tick(db)

    expect(db.tables.broadcast_campaigns[0]).toMatchObject({ status: 'sending' })
    expect(recipient(db, 'r-3')).toMatchObject({ status: 'deferred' })
  })

  it('stops the run and requeues when Meta says the line is saturated', async () => {
    const db = seed()
    mockSendQuickReplies
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('{"error":{"code":130429}}'))

    const result = await tick(db)

    expect(result.stopped).toBe(true)
    expect(recipient(db, 'r-2')).toMatchObject({ status: 'pending', claimed_at: null })
  })

  it('requeues rather than skips when the account is restricted mid-campaign', async () => {
    const db = seed()

    await runBroadcastTick({ now: NOW, immediate: true, batch: 2 })
    expect(sentPhones()).toHaveLength(2)

    // Meta restricts the number. The guard refuses at the campaign level, and the
    // drain must not spend the rest of the audience marking them failed.
    db.tables.organizations[0].wa_account_restricted = true
    db.tables.broadcast_campaigns[0].status = 'paused'
    db.tables.broadcast_campaigns[0].paused_reason = 'blocked_by_meta'

    const result = await runBroadcastTick({ now: NOW, immediate: true, batch: 2 })

    expect(result.claimed).toBe(0)
    expect(sentPhones()).toHaveLength(2)
    expect(recipient(db, 'r-3')).toMatchObject({ status: 'pending' })
  })
})

// ── Starting a campaign ──────────────────────────────────────────────────────

describe('startCampaign', () => {
  it('refuses to start a campaign that is already in flight', async () => {
    const db = seed({ campaign: { status: 'sending', started_at: NOW.toISOString(), sent_count: 2 } })

    const result = await startCampaign('c-1', { now: NOW })

    expect(result).toEqual({ ok: false, reason: 'already_started' })
    expect(db.tables.broadcast_campaigns[0]).toMatchObject({ sent_count: 2, status: 'sending' })
  })

  it('refuses to resurrect a cancelled campaign', async () => {
    const db = seed({ campaign: { status: 'cancelled', started_at: NOW.toISOString() } })

    expect(await startCampaign('c-1', { now: NOW })).toEqual({ ok: false, reason: 'already_started' })
    expect(db.tables.broadcast_campaigns[0].status).toBe('cancelled')
  })

  /**
   * The 350 lost parents. A tier-250 number that has already opened 246
   * conversations today leaves a budget of 2, so four of the six audience
   * members cannot go out now. They must be queued for the next window, not
   * written into a terminal `skipped` state nothing ever revisits.
   */
  it('defers the part of an audience past the daily cap instead of losing it', async () => {
    const db = seed({
      campaign: {
        status: 'draft',
        started_at: null,
        audience: { kind: 'manual', parentIds: ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6'] },
      },
      parents: [1, 2, 3, 4, 5, 6].map((n) => parentRow(n)),
      recipients: [],
      org: orgRow({ wa_messaging_limit_tier: 'TIER_250' }),
    })
    // 246 distinct numbers already messaged today → 4 left, half of which is 2.
    db.tables.whatsapp_messages = Array.from({ length: 246 }, (_, i) => ({
      organization_id: ORG,
      direction: 'out',
      kind: 'template',
      phone: `+9725999${String(i).padStart(4, '0')}`,
      created_at: '2026-09-09T09:00:00.000Z',
    }))

    const result = await startCampaign('c-1', { now: NOW })

    expect(result).toMatchObject({ ok: true, recipients: 2, deferred: 4, skipped: 0 })

    const rows = db.tables.broadcast_recipients
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(2)
    expect(rows.filter((r) => r.status === 'deferred')).toHaveLength(4)
    expect(rows.filter((r) => r.status === 'skipped')).toHaveLength(0)
    // Nothing is dropped: every audience member has a row with a future.
    expect(rows).toHaveLength(6)
    for (const row of rows.filter((r) => r.status === 'deferred')) {
      expect(new Date(String(row.deferred_until)).getTime()).toBeGreaterThan(NOW.getTime())
    }
    // And the campaign still owes work.
    expect(db.tables.broadcast_campaigns[0].status).toBe('sending')
  })

  it('writes one recipient for a parent who appears in the audience twice', async () => {
    const db = seed({
      campaign: {
        status: 'draft',
        started_at: null,
        audience: { kind: 'manual', parentIds: ['p-1', 'p-2'] },
      },
      // Two parent rows, one household number — a parent of two students.
      parents: [parentRow(1), parentRow(2, { phone: '+972500000001' })],
      recipients: [],
    })

    const result = await startCampaign('c-1', { now: NOW })

    expect(result).toMatchObject({ ok: true, recipients: 1 })
    expect(db.tables.broadcast_recipients).toHaveLength(1)
  })

  it('lets exactly one of two racing callers start a draft', async () => {
    const db = seed({ campaign: { status: 'draft', started_at: null }, recipients: [] })

    const [a, b] = await Promise.all([
      startCampaign('c-1', { now: NOW }),
      startCampaign('c-1', { now: NOW }),
    ])

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(db.tables.broadcast_campaigns).toHaveLength(1)
  })
})
