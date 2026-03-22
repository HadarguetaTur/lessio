import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('@/lib/whatsapp', async () => {
  const actual = await vi.importActual('@/lib/whatsapp')
  return {
    ...actual,
    sendBookingLink: vi.fn().mockResolvedValue(undefined),
    sendUnknownParentReply: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/jwt', () => ({
  signBookingToken: vi.fn().mockResolvedValue('signed-token-abc'),
  verifyBookingToken: vi.fn(),
}))

import { GET, POST } from './route'
import { sendBookingLink, sendUnknownParentReply } from '@/lib/whatsapp'

const mockSendBookingLink = vi.mocked(sendBookingLink)
const mockSendUnknownParentReply = vi.mocked(sendUnknownParentReply)

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_SECRET = 'test-app-secret'
const VERIFY_TOKEN = 'test-verify-token'
const BASE_URL = 'https://example.com'

const ORG_ID = 'org-1'
const PARENT_ID = 'parent-1'
const STUDENT_ID = 'student-1'

// Sender phone as Meta sends it (without +)
const SENDER_PHONE_META = '972501234567'
// Org business phone as Meta sends it (9725 + 8 digits = 12 digits, no +)
const BUSINESS_PHONE_META = '972520000000'
// Normalized
const SENDER_PHONE_E164 = '+972501234567'
const BUSINESS_PHONE_E164 = '+972520000000'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWebhookPayload(text: string, from = SENDER_PHONE_META) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: BUSINESS_PHONE_META,
            phone_number_id: 'phone-number-id-1',
          },
          messages: [{
            from,
            id: 'msg-1',
            type: 'text',
            text: { body: text },
          }],
        },
      }],
    }],
  }
}

function makeSignature(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

function makeRequest(body: object, { signed = true, secret = APP_SECRET } = {}): NextRequest {
  const bodyStr = JSON.stringify(body)
  const sig = signed ? makeSignature(bodyStr) : 'sha256=badsig'
  return new NextRequest(`${BASE_URL}/api/whatsapp/webhook`, {
    method: 'POST',
    body: bodyStr,
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': sig,
    },
  })
}

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'insert', 'update', 'neq'].forEach(m => { self[m] = pass })
  self['maybeSingle'] = () => Promise.resolve(result)
  self['single'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return self
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/whatsapp/webhook', () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
  })

  it('returns the challenge when verify_token matches', async () => {
    const url = `${BASE_URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`
    const req = new NextRequest(url)
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('abc123')
  })

  it('returns 403 when verify_token is wrong', async () => {
    const url = `${BASE_URL}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`
    const req = new NextRequest(url)
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/whatsapp/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id'
  })

  it('returns 200 for a valid signed request', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))
    const req = makeRequest(makeWebhookPayload('hello'))
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 403 when X-Hub-Signature-256 is invalid', async () => {
    const req = makeRequest(makeWebhookPayload('שיעור'), { signed: false })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('sends unknown parent reply and creates lead when parent not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null }, error: null })
      if (table === 'parents') return buildChain({ data: null, error: null }) // not found
      if (table === 'leads') return buildChain({ data: null, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendUnknownParentReply).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.any(String),
      expect.any(String)
    )
    expect(mockSendBookingLink).not.toHaveBeenCalled()
  })

  it('sends booking link when parent has exactly one student and message has booking intent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      if (table === 'relationships') {
        const chain = buildChain(null) as Record<string, unknown>
        chain['select'] = () => chain
        chain['eq'] = () => chain
        chain['then'] = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ student_id: STUDENT_ID }], error: null }).then(res)
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אני רוצה שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendBookingLink).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.stringContaining('/book/signed-token-abc'),
      expect.any(String),
      expect.any(String)
    )
  })

  it('does not send booking link when message has no booking intent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שלום'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendBookingLink).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('returns 200 even when no org matches the business phone', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: null, error: null }) // no org
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שיעור'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendBookingLink).not.toHaveBeenCalled()
  })
})
