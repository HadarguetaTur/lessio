import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordingClient } from '@/test/supabase'

const mockCreateServiceRoleClient = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}))

import {
  isUnsubscribeToken,
  newUnsubscribeToken,
  unsubscribeByToken,
  unsubscribeFooter,
  unsubscribeHeaders,
  unsubscribeUrl,
} from './unsubscribe'

/** recordingClient has no rpc(); this adds one that records the call. */
function clientWithRpc(options: Parameters<typeof recordingClient>[0] = {}) {
  const db = recordingClient(options)
  const rpc = vi.fn(async () => ({ data: { email: 'x', leads: 1, messages: 1, prospects: 1 }, error: null }))
  return { ...db, rpc, client: { ...db.client, rpc } }
}

beforeEach(() => vi.clearAllMocks())

describe('tokens', () => {
  it('mints 128 bits of hex', () => {
    const token = newUnsubscribeToken()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(newUnsubscribeToken()).not.toBe(token)
  })

  it('recognises only well-formed tokens', () => {
    expect(isUnsubscribeToken('a'.repeat(32))).toBe(true)
    expect(isUnsubscribeToken('A'.repeat(32))).toBe(false)
    expect(isUnsubscribeToken('a'.repeat(31))).toBe(false)
    expect(isUnsubscribeToken('../../etc/passwd')).toBe(false)
  })
})

describe('headers and footer', () => {
  it('asks the mail client for its own one-click button', () => {
    const headers = unsubscribeHeaders('b'.repeat(32))
    expect(headers['List-Unsubscribe']).toBe(`<${unsubscribeUrl('b'.repeat(32))}>`)
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('offers the link in both languages', () => {
    const url = 'https://x.test/u/abc'
    const he = unsubscribeFooter(url, 'he')
    expect(he.text).toContain(url)
    expect(he.html).toContain(`href="${url}"`)
    expect(he.text).not.toContain('—')

    const en = unsubscribeFooter(url, 'en')
    expect(en.text).toContain('One click')
    expect(en.html).toContain(`href="${url}"`)
  })
})

describe('unsubscribeByToken', () => {
  it('answers "gone" for a malformed token without asking the database', async () => {
    const db = clientWithRpc()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    expect(await unsubscribeByToken('not-a-token', 'link')).toBe('gone')
    expect(db.tables()).toEqual([])
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('answers "gone" for a token that was already used', async () => {
    const db = clientWithRpc({ data: { outbound_prospects: null } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    expect(await unsubscribeByToken('c'.repeat(32), 'one_click')).toBe('gone')
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('erases the person behind a live token', async () => {
    const db = clientWithRpc({ data: { outbound_prospects: { email: 'dana@example.com' } } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    expect(await unsubscribeByToken('d'.repeat(32), 'one_click')).toBe('erased')
    expect(db.rpc).toHaveBeenCalledWith('erase_outbound_prospect', {
      p_email: 'dana@example.com',
      p_source: 'unsubscribe:one_click',
    })
  })
})
