/**
 * Unit tests for the support ticket data layer — Sprint 32 M1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  createTicket,
  addMessage,
  getTicketWithMessages,
  setStatus,
  countRecentTicketsForOrg,
  listTicketsForOrg,
} from './tickets'

/** Fluent Supabase-like chain that resolves to `result` when awaited. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  ;['select', 'eq', 'gt', 'in', 'order', 'limit', 'insert', 'update'].forEach((m) => {
    chain[m] = () => chain
  })
  chain['single'] = () => Promise.resolve(result)
  chain['maybeSingle'] = () => Promise.resolve(result)
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── createTicket() ────────────────────────────────────────────────────────────

describe('createTicket()', () => {
  it('inserts the ticket and its opening message, returning the new id', async () => {
    const ticketInsert = vi.fn().mockReturnValue(makeChain({ data: { id: 'ticket-1' }, error: null }))
    const messageInsert = vi.fn().mockResolvedValue({ error: null })

    mockCreateServiceRoleClient.mockReturnValue({
      from: (table: string) =>
        table === 'support_tickets' ? { insert: ticketInsert } : { insert: messageInsert },
    })

    const id = await createTicket({
      orgId: 'org-1',
      createdBy: 'profile-1',
      subject: 'לא מצליחה לשלוח בקשת תשלום',
      body: 'לחצתי על שליחה וקיבלתי שגיאה',
      source: 'widget',
      category: 'bug',
      pageUrl: '/billing',
    })

    expect(id).toBe('ticket-1')
    expect(ticketInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        created_by: 'profile-1',
        source: 'widget',
        category: 'bug',
        page_url: '/billing',
      })
    )
    expect(messageInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 'ticket-1',
        author_type: 'customer',
        author_profile_id: 'profile-1',
        body: 'לחצתי על שליחה וקיבלתי שגיאה',
      })
    )
  })

  it('returns null and writes no message when the ticket insert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const messageInsert = vi.fn()

    mockCreateServiceRoleClient.mockReturnValue({
      from: (table: string) =>
        table === 'support_tickets'
          ? { insert: () => makeChain({ data: null, error: { message: 'db down' } }) }
          : { insert: messageInsert },
    })

    const id = await createTicket({
      orgId: 'org-1',
      createdBy: null,
      subject: 'x',
      body: 'y',
      source: 'whatsapp',
    })

    expect(id).toBeNull()
    expect(messageInsert).not.toHaveBeenCalled()
  })

  it('defaults optional context columns to null', async () => {
    const ticketInsert = vi.fn().mockReturnValue(makeChain({ data: { id: 't' }, error: null }))
    mockCreateServiceRoleClient.mockReturnValue({
      from: (table: string) =>
        table === 'support_tickets'
          ? { insert: ticketInsert }
          : { insert: vi.fn().mockResolvedValue({ error: null }) },
    })

    await createTicket({
      orgId: 'org-1',
      createdBy: null,
      subject: 'x',
      body: 'y',
      source: 'whatsapp',
    })

    expect(ticketInsert).toHaveBeenCalledWith(
      expect.objectContaining({ category: null, page_url: null, user_agent: null })
    )
  })
})

// ── addMessage() ──────────────────────────────────────────────────────────────

describe('addMessage()', () => {
  it('returns false and logs when the insert fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ insert: vi.fn().mockResolvedValue({ error: { message: 'db down' } }) }),
    })

    const ok = await addMessage({ ticketId: 't', authorType: 'admin', body: 'hi' })

    expect(ok).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})

// ── getTicketWithMessages() ───────────────────────────────────────────────────

describe('getTicketWithMessages()', () => {
  it('scopes by organization when an orgId is given', async () => {
    const eq = vi.fn()
    const chain: Record<string, unknown> = {}
    chain['select'] = () => chain
    chain['eq'] = (...args: unknown[]) => {
      eq(...args)
      return chain
    }
    chain['order'] = () => chain
    chain['maybeSingle'] = () => Promise.resolve({ data: { id: 't', organization_id: 'org-1' }, error: null })
    chain['then'] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)

    mockCreateServiceRoleClient.mockReturnValue({ from: () => chain })

    await getTicketWithMessages('t', 'org-1')

    expect(eq).toHaveBeenCalledWith('id', 't')
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('returns null when the ticket is not found', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ data: null, error: null }),
    })

    await expect(getTicketWithMessages('missing', 'org-1')).resolves.toBeNull()
  })
})

// ── setStatus() ───────────────────────────────────────────────────────────────

describe('setStatus()', () => {
  it('stamps resolved_at when resolving', async () => {
    const update = vi.fn().mockReturnValue(makeChain({ error: null }))
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ update }) })

    await setStatus('t', 'resolved')

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', resolved_at: expect.any(String) })
    )
  })

  it('clears resolved_at when moving back to an open status', async () => {
    const update = vi.fn().mockReturnValue(makeChain({ error: null }))
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ update }) })

    await setStatus('t', 'in_progress')

    expect(update).toHaveBeenCalledWith({ status: 'in_progress', resolved_at: null })
  })
})

// ── countRecentTicketsForOrg() ────────────────────────────────────────────────

describe('countRecentTicketsForOrg()', () => {
  it('returns the count', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ count: 3, error: null }),
    })

    await expect(countRecentTicketsForOrg('org-1')).resolves.toBe(3)
  })

  it('fails open with 0 on a DB error, so a counting failure never blocks a customer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ count: null, error: { message: 'db down' } }),
    })

    await expect(countRecentTicketsForOrg('org-1')).resolves.toBe(0)
  })
})

// ── listTicketsForOrg() ───────────────────────────────────────────────────────

describe('listTicketsForOrg()', () => {
  it('attaches message counts and the last activity timestamp', async () => {
    const tickets = [
      { id: 't1', organization_id: 'org-1', created_at: '2026-08-01T10:00:00Z' },
      { id: 't2', organization_id: 'org-1', created_at: '2026-08-02T10:00:00Z' },
    ]
    const messages = [
      { ticket_id: 't1', created_at: '2026-08-01T10:00:00Z' },
      { ticket_id: 't1', created_at: '2026-08-03T09:00:00Z' },
    ]

    mockCreateServiceRoleClient.mockReturnValue({
      from: (table: string) =>
        table === 'support_tickets'
          ? makeChain({ data: tickets, error: null })
          : makeChain({ data: messages, error: null }),
    })

    const result = await listTicketsForOrg('org-1')

    expect(result[0]).toMatchObject({ id: 't1', message_count: 2, last_message_at: '2026-08-03T09:00:00Z' })
    // A ticket with no message rows falls back to its own created_at.
    expect(result[1]).toMatchObject({ id: 't2', message_count: 0, last_message_at: '2026-08-02T10:00:00Z' })
  })

  it('returns an empty array when the org has no tickets', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ data: [], error: null }),
    })

    await expect(listTicketsForOrg('org-1')).resolves.toEqual([])
  })
})
