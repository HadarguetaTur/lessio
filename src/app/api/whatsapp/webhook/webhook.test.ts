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
    sendCancellationLessonList: vi.fn().mockResolvedValue(undefined),
    sendNoEligibleLessonsReply: vi.fn().mockResolvedValue(undefined),
    sendInvalidSelectionReply: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/cancellation-flow', () => ({
  getEligibleLessons: vi.fn().mockResolvedValue([]),
  formatLessonListMessage: vi.fn().mockReturnValue('lesson list message'),
  upsertCancellationSession: vi.fn().mockResolvedValue(undefined),
  getActiveCancellationSession: vi.fn().mockResolvedValue(null),
  deleteCancellationSession: vi.fn().mockResolvedValue(undefined),
  executeCancellation: vi.fn().mockResolvedValue({ success: false, error: 'not_found' }),
}))

const mockUpsertLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/leads', () => ({
  upsertLead: (...args: unknown[]) => mockUpsertLead(...args),
}))

vi.mock('@/lib/jwt', () => ({
  signBookingToken: vi.fn().mockResolvedValue('signed-token-abc'),
  verifyBookingToken: vi.fn(),
}))

import { GET, POST } from './route'
import {
  sendBookingLink,
  sendUnknownParentReply,
  sendInvalidSelectionReply,
  sendCancellationLessonList,
} from '@/lib/whatsapp'
import {
  getActiveCancellationSession,
  deleteCancellationSession,
  upsertCancellationSession,
  getEligibleLessons,
  executeCancellation,
} from '@/lib/cancellation-flow'

const mockSendBookingLink = vi.mocked(sendBookingLink)
const mockSendUnknownParentReply = vi.mocked(sendUnknownParentReply)
const mockSendInvalidSelectionReply = vi.mocked(sendInvalidSelectionReply)
const mockSendCancellationLessonList = vi.mocked(sendCancellationLessonList)
const mockGetActiveCancellationSession = vi.mocked(getActiveCancellationSession)
const mockDeleteCancellationSession = vi.mocked(deleteCancellationSession)
const mockUpsertCancellationSession = vi.mocked(upsertCancellationSession)
const mockGetEligibleLessons = vi.mocked(getEligibleLessons)
const mockExecuteCancellation = vi.mocked(executeCancellation)

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

function makeRequest(body: object, { signed = true } = {}): NextRequest {
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
  ;['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'order', 'insert', 'update', 'delete', 'upsert'].forEach(m => { self[m] = pass })
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

  it('returns 401 when X-Hub-Signature-256 is invalid', async () => {
    const req = makeRequest(makeWebhookPayload('שיעור'), { signed: false })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('sends unknown parent reply and creates lead when parent not found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: null, error: null }) // not found
      if (table === 'leads') return buildChain({ data: null, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendUnknownParentReply).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockSendBookingLink).not.toHaveBeenCalled()
  })

  it('sends booking link when parent has exactly one student and message has booking intent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
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
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockUpsertLead).not.toHaveBeenCalled()
  })

  it('does not send booking link when message has no booking intent', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
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

describe('WhatsApp cancellation intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id'
  })

  it('starts cancellation flow when parent sends ביטול', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      if (table === 'relationships') return buildChain({ data: [], error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('ביטול'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    // No booking link sent
    expect(mockSendBookingLink).not.toHaveBeenCalled()
  })

  it('does not start cancellation for unrelated message from known parent', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('תודה רבה'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendBookingLink).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('does not create lead for recognized parent (converted phone routes as parent, not lead)', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שלום'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('invalid selection input keeps cancellation flow open', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce({
      id: 'session-1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      lesson_ids: ['lesson-1', 'lesson-2'],
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    })
    mockGetEligibleLessons.mockResolvedValueOnce([
      { id: 'lesson-1', start_at: new Date(Date.now() + 86400000).toISOString(), student_name: 'A', teacher_name: 'B' },
    ])
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('xyz'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendInvalidSelectionReply).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockDeleteCancellationSession).not.toHaveBeenCalled()
    expect(mockUpsertCancellationSession).toHaveBeenCalledWith(
      ORG_ID,
      SENDER_PHONE_E164,
      ['lesson-1']
    )
    expect(mockSendCancellationLessonList).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'lesson list message',
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockExecuteCancellation).not.toHaveBeenCalled()
  })

  it('lesson no longer eligible returns error and refreshed list', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce({
      id: 'session-1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      lesson_ids: ['lesson-1'],
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    })
    mockExecuteCancellation.mockResolvedValueOnce({ success: false, error: 'not_eligible' })
    mockGetEligibleLessons.mockResolvedValueOnce([
      { id: 'lesson-2', start_at: new Date(Date.now() + 86400000).toISOString(), student_name: 'A', teacher_name: 'B' },
    ])
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_token: null, timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('1'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendCancellationLessonList).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.stringContaining('השיעור שנבחר אינו זמין עוד לביטול.'),
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockUpsertCancellationSession).toHaveBeenCalledWith(
      ORG_ID,
      SENDER_PHONE_E164,
      ['lesson-2']
    )
    expect(mockDeleteCancellationSession).not.toHaveBeenCalled()
  })
})
