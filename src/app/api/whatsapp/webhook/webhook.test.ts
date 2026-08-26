import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockIsAiAssistantConfigured = vi.hoisted(() => vi.fn())

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn().mockReturnValue('test-access-token'),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('@/lib/whatsapp', async () => {
  const actual = await vi.importActual('@/lib/whatsapp')
  return {
    ...actual,
    sendTextMessage: vi.fn().mockResolvedValue(undefined),
    sendUnknownParentReply: vi.fn().mockResolvedValue(undefined),
    sendCancellationLessonList: vi.fn().mockResolvedValue(undefined),
    sendNoEligibleLessonsReply: vi.fn().mockResolvedValue(undefined),
    sendInvalidSelectionReply: vi.fn().mockResolvedValue(undefined),
    sendHomeworkAlert: vi.fn().mockResolvedValue(undefined),
  }
})

// Interactive sends hit graph.facebook.com directly. Mock the transport, keep
// the real payload encoding/greeting logic so routing is still exercised.
vi.mock('@/lib/whatsapp/interactive', () => ({
  sendListMessage: vi.fn().mockResolvedValue(undefined),
  sendReplyButtons: vi.fn().mockResolvedValue(undefined),
  sendTemplateWithQuickReplies: vi.fn().mockResolvedValue(undefined),
  REPLY_BUTTONS_MAX: 3,
}))

vi.mock('@/lib/whatsapp/templates', () => ({
  resolveTemplate: vi.fn().mockImplementation(
    (_orgId: string, _type: string, vars: Record<string, string> = {}) =>
      Promise.resolve(vars['booking_url'] ?? 'mocked-template-body')
  ),
}))

// Link replies go out as interactive CTA buttons; the CTA-vs-text decision and
// its fallbacks are covered in src/lib/whatsapp/sendLinkReply.test.ts. Here we
// only assert the webhook hands over the right template type and URL.
vi.mock('@/lib/whatsapp/sendLinkReply', () => ({
  sendLinkReply: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/cancellation-flow', () => ({
  getEligibleLessons: vi.fn().mockResolvedValue([]),
  formatLessonListMessage: vi.fn().mockReturnValue('lesson list message'),
  upsertCancellationSession: vi.fn().mockResolvedValue(undefined),
  getActiveCancellationSession: vi.fn().mockResolvedValue(null),
  deleteCancellationSession: vi.fn().mockResolvedValue(undefined),
  executeCancellation: vi.fn().mockResolvedValue({ success: false, error: 'not_found' }),
}))

vi.mock('@/lib/support/supportSessions', () => ({
  startSupportSession: vi.fn().mockResolvedValue(undefined),
  setSupportDraft: vi.fn().mockResolvedValue(undefined),
  getActiveSupportSession: vi.fn().mockResolvedValue(null),
  deleteSupportSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/support/tickets', () => ({
  createTicket: vi.fn().mockResolvedValue('ticket-1'),
}))

vi.mock('@/lib/support/classify', () => ({
  classifyTicketInBackground: vi.fn(),
}))

vi.mock('@/lib/ai-assistant', () => ({
  aiAssistant: vi.fn().mockResolvedValue({
    reply: 'ai-reply',
    promptTokens: 50,
    completionTokens: 20,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
  isAiAssistantConfigured: mockIsAiAssistantConfigured,
}))

vi.mock('@/lib/ai-assistant/conversationLog', () => ({
  logExchange: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/idempotency', () => ({
  claimIncomingMessage: vi.fn().mockResolvedValue(true),
  releaseIncomingMessageClaim: vi.fn().mockResolvedValue(undefined),
  isRateLimited: vi.fn().mockResolvedValue(false),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  notifyMultiple: vi.fn().mockResolvedValue(undefined),
  getOwnerAndAdminProfileIds: vi.fn().mockResolvedValue([]),
  notifySuperadmins: vi.fn().mockResolvedValue(undefined),
  hasRecentUnreadSuperadminNotification: vi.fn().mockResolvedValue(false),
}))

const mockUpsertLead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/leads', () => ({
  upsertLead: (...args: unknown[]) => mockUpsertLead(...args),
}))

vi.mock('@/lib/jwt', () => ({
  signBookingToken: vi.fn().mockResolvedValue('signed-token-abc'),
  verifyBookingToken: vi.fn(),
}))

vi.mock('@/lib/homework', () => ({
  markAssignmentDone: vi.fn().mockResolvedValue({ id: 'hw-1', status: 'done' }),
}))

vi.mock('@/lib/day-off', () => ({
  createDayOffRequest: vi.fn(),
  notifyStaffOfRequest: vi.fn().mockResolvedValue(undefined),
  countLessonsInRange: vi.fn().mockResolvedValue(0),
  getPendingRequests: vi.fn().mockResolvedValue([]),
  getRequestById: vi.fn().mockResolvedValue(null),
  approveDayOffRequest: vi.fn().mockResolvedValue({ status: 'not_found' }),
  rejectDayOffRequest: vi.fn().mockResolvedValue({ status: 'not_found' }),
}))

import { GET, POST } from './route'
import { decryptToken } from '@/lib/crypto'
import {
  sendTextMessage,
  sendUnknownParentReply,
  sendInvalidSelectionReply,
  sendCancellationLessonList,
  sendHomeworkAlert,
} from '@/lib/whatsapp'
import {
  getActiveCancellationSession,
  deleteCancellationSession,
  upsertCancellationSession,
  getEligibleLessons,
  executeCancellation,
} from '@/lib/cancellation-flow'
import { aiAssistant, isAiAssistantConfigured } from '@/lib/ai-assistant'
import { logExchange } from '@/lib/ai-assistant/conversationLog'
import { claimIncomingMessage, releaseIncomingMessageClaim, isRateLimited } from '@/lib/whatsapp/idempotency'
import {
  notifyMultiple,
  notifySuperadmins,
  hasRecentUnreadSuperadminNotification,
} from '@/lib/notifications'
import { sendLinkReply } from '@/lib/whatsapp/sendLinkReply'
import { botString } from '@/lib/whatsapp/strings'
import {
  sendListMessage,
  sendReplyButtons,
  sendTemplateWithQuickReplies,
} from '@/lib/whatsapp/interactive'
import { signBookingToken } from '@/lib/jwt'
import { markAssignmentDone } from '@/lib/homework'
import {
  approveDayOffRequest,
  countLessonsInRange,
  createDayOffRequest,
  getPendingRequests,
  getRequestById,
  notifyStaffOfRequest,
  rejectDayOffRequest,
} from '@/lib/day-off'
import {
  startSupportSession,
  setSupportDraft,
  getActiveSupportSession,
  deleteSupportSession,
} from '@/lib/support/supportSessions'
import { createTicket } from '@/lib/support/tickets'
import * as Sentry from '@sentry/nextjs'

const mockStartSupportSession = vi.mocked(startSupportSession)
const mockSetSupportDraft = vi.mocked(setSupportDraft)
const mockGetActiveSupportSession = vi.mocked(getActiveSupportSession)
const mockDeleteSupportSession = vi.mocked(deleteSupportSession)
const mockCreateTicket = vi.mocked(createTicket)

const mockSendListMessage = vi.mocked(sendListMessage)
const mockSendTemplateWithQuickReplies = vi.mocked(sendTemplateWithQuickReplies)
const mockSendReplyButtons = vi.mocked(sendReplyButtons)
const mockSignBookingToken = vi.mocked(signBookingToken)
const mockSendLinkReply = vi.mocked(sendLinkReply)
const mockSendTextMessage = vi.mocked(sendTextMessage)
const mockSendUnknownParentReply = vi.mocked(sendUnknownParentReply)
const mockSendInvalidSelectionReply = vi.mocked(sendInvalidSelectionReply)
const mockSendCancellationLessonList = vi.mocked(sendCancellationLessonList)
const mockSendHomeworkAlert = vi.mocked(sendHomeworkAlert)
const mockGetActiveCancellationSession = vi.mocked(getActiveCancellationSession)
const mockDeleteCancellationSession = vi.mocked(deleteCancellationSession)
const mockUpsertCancellationSession = vi.mocked(upsertCancellationSession)
const mockGetEligibleLessons = vi.mocked(getEligibleLessons)
const mockExecuteCancellation = vi.mocked(executeCancellation)
const mockAiAssistant = vi.mocked(aiAssistant)
const mockAiAssistantConfigured = vi.mocked(isAiAssistantConfigured)
const mockLogExchange = vi.mocked(logExchange)
const mockClaimIncomingMessage = vi.mocked(claimIncomingMessage)
const mockReleaseIncomingMessageClaim = vi.mocked(releaseIncomingMessageClaim)
const mockIsRateLimited = vi.mocked(isRateLimited)
const mockMarkAssignmentDone = vi.mocked(markAssignmentDone)
const mockCreateDayOffRequest = vi.mocked(createDayOffRequest)
const mockNotifyStaffOfRequest = vi.mocked(notifyStaffOfRequest)
const mockCountLessonsInRange = vi.mocked(countLessonsInRange)
const mockGetPendingRequests = vi.mocked(getPendingRequests)
const mockGetRequestById = vi.mocked(getRequestById)
const mockApproveDayOffRequest = vi.mocked(approveDayOffRequest)
const mockRejectDayOffRequest = vi.mocked(rejectDayOffRequest)
const mockNotifyMultiple = vi.mocked(notifyMultiple)
const mockNotifySuperadmins = vi.mocked(notifySuperadmins)
const mockHasRecentUnreadSuperadminNotification = vi.mocked(hasRecentUnreadSuperadminNotification)
const mockSentryCaptureException = vi.mocked(Sentry.captureException)
const mockDecryptToken = vi.mocked(decryptToken)

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
/**
 * Filler body for tests that only care about routing, not wording. Deliberately
 * NOT a greeting: a bare "שלום"/"hi" now short-circuits into the interactive
 * menu before any intent handling runs.
 */
const NEUTRAL_TEXT = 'רציתי לשאול משהו'
// ── Helpers ───────────────────────────────────────────────────────────────────

/** Payload shape Meta sends when a parent taps a list row or reply button. */
function makeInteractivePayload(replyId: string, title = 'tapped') {
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
            from: SENDER_PHONE_META,
            id: 'msg-1',
            type: 'interactive',
            interactive: { type: 'list_reply', list_reply: { id: replyId, title } },
          }],
        },
      }],
    }],
  }
}

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
  ;['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'order', 'limit', 'insert', 'update', 'delete', 'upsert'].forEach(m => { self[m] = pass })
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
    mockClaimIncomingMessage.mockResolvedValue(true)
    mockReleaseIncomingMessageClaim.mockResolvedValue(undefined)
    mockAiAssistant.mockResolvedValue({
      reply: 'ai-reply',
      promptTokens: 50,
      completionTokens: 20,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
    mockAiAssistantConfigured.mockReturnValue(true)
    mockLogExchange.mockResolvedValue(undefined)
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
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
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
      'phone-number-id-1',
      'he'
    )
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('sends booking link when parent has exactly one student and message has booking intent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      if (table === 'relationships') {
        const chain = buildChain(null) as Record<string, unknown>
        chain['select'] = () => chain
        chain['eq'] = () => chain
        chain['then'] = (res: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [{ student_id: STUDENT_ID, students: { id: STUDENT_ID, full_name: 'דנה' } }],
            error: null,
          }).then(res)
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אני רוצה לקבוע שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendLinkReply).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        to: SENDER_PHONE_E164,
        templateType: 'booking_link',
        urlVar: 'booking_url',
        url: expect.stringContaining('/book/signed-token-abc'),
        buttonKey: 'cta_book_lesson',
        accessToken: 'test-access-token',
        phoneNumberId: 'phone-number-id-1',
      })
    )
    expect(mockUpsertLead).not.toHaveBeenCalled()
  })

  it('builds the portal link from the request origin, never from NEXT_PUBLIC_APP_URL', async () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    try {
      const req = makeRequest(makeWebhookPayload('אזור אישי'))
      const res = await POST(req)

      expect(res.status).toBe(200)
      expect(mockSendLinkReply).toHaveBeenCalledWith(
        expect.objectContaining({
          templateType: 'portal_link_reply',
          urlVar: 'portal_url',
          buttonKey: 'cta_open_portal',
          url: `https://example.com/portal/${ORG_ID}`,
        })
      )
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  })

  it('sends unknown-intent fallback when message has no booking intent', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    // The tappable menu IS the "I did not understand" reply. Sending the text
    // template as well put two messages in front of the parent for one inbound
    // message — assert exactly one goes out.
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('falls back to the text template when the interactive menu is rejected', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    // e.g. 131047 outside the 24h window.
    mockSendListMessage.mockRejectedValueOnce(new Error('131047'))
    mockSendTemplateWithQuickReplies.mockRejectedValueOnce(new Error('template not approved'))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeWebhookPayload(NEUTRAL_TEXT)))

    expect(res.status).toBe(200)
    // Still exactly one message — the text version, now that buttons failed.
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'mocked-template-body',
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('sends an AI reply and logs the exchange when AI assistant is enabled', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: true,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אפשר עזרה עם התשלום?'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockAiAssistant).toHaveBeenCalledWith(
      ORG_ID,
      SENDER_PHONE_E164,
      PARENT_ID,
      'אפשר עזרה עם התשלום?',
      'he'
    )
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'ai-reply',
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockLogExchange).toHaveBeenCalledWith(
      ORG_ID,
      SENDER_PHONE_E164,
      PARENT_ID,
      'אפשר עזרה עם התשלום?',
      'ai-reply'
    )
  })

  it('falls back to the generic template when the AI assistant throws', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockAiAssistant.mockRejectedValueOnce(new Error('openai down'))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: true,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אפשר עזרה עם התשלום?'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'mocked-template-body',
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockLogExchange).not.toHaveBeenCalled()
  })

  it('falls back to the generic template when AI is enabled but OPENAI_API_KEY is missing', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockAiAssistantConfigured.mockReturnValue(false)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: true,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אפשר עזרה עם התשלום?'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockAiAssistant).not.toHaveBeenCalled()
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('ignores duplicate webhook deliveries for the same message id', async () => {
    mockClaimIncomingMessage.mockResolvedValueOnce(false)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: true,
          },
          error: null,
        })
      }
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אפשר עזרה עם התשלום?'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockAiAssistant).not.toHaveBeenCalled()
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('releases the inbound claim when sending the AI reply fails', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockSendTextMessage.mockRejectedValueOnce(new Error('send failed'))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: true,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אפשר עזרה עם התשלום?'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockReleaseIncomingMessageClaim).toHaveBeenCalledWith(ORG_ID, 'msg-1')
    expect(mockLogExchange).not.toHaveBeenCalled()
  })

  it('releases the inbound claim when parent lookup fails after the claim is taken', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: false,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: null, error: { message: 'db down' } })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockReleaseIncomingMessageClaim).toHaveBeenCalledWith(ORG_ID, 'msg-1')
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('releases the inbound claim when every reply path fails', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    // The unknown-intent reply is now the interactive menu, so the claim is only
    // released once the menu, its template twin AND the text fallback all fail —
    // at that point the parent got nothing and Meta's retry should re-enter.
    mockSendListMessage.mockRejectedValueOnce(new Error('131047'))
    mockSendTemplateWithQuickReplies.mockRejectedValueOnce(new Error('not approved'))
    mockSendTextMessage.mockRejectedValueOnce(new Error('send failed'))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: false,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockReleaseIncomingMessageClaim).toHaveBeenCalledWith(ORG_ID, 'msg-1')
    expect(mockLogExchange).not.toHaveBeenCalled()
  })

  it('sends an explanatory reply when booking is requested without a linked student', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            ai_assistant_enabled: false,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      if (table === 'relationships') return buildChain({ data: [], error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('אני רוצה לקבוע שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.stringContaining('אין תלמיד מקושר'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('returns 200 even when no org matches the business phone', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: null, error: null }) // no org
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שיעור'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('does not release the claim on successful message processing', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem', ai_assistant_enabled: false }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    await POST(req)

    expect(mockReleaseIncomingMessageClaim).not.toHaveBeenCalled()
  })

  it('returns 200 without claiming when token decryption fails', async () => {
    mockDecryptToken.mockImplementationOnce(() => { throw new Error('decryption failed') })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockClaimIncomingMessage).not.toHaveBeenCalled()
    expect(mockReleaseIncomingMessageClaim).not.toHaveBeenCalled()
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
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      if (table === 'relationships') return buildChain({ data: [], error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('ביטול'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    // No booking link sent
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('sends unknown-intent fallback for unrelated message from known parent', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('תודה רבה'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
    expect(mockSendListMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.objectContaining({ rows: expect.any(Array) }),
      'test-access-token',
      'phone-number-id-1'
    )
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('does not create lead for recognized parent (converted phone routes as parent, not lead)', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
    // Routed as a known parent: the menu goes out, not the unknown-sender reply.
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
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
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('xyz'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    // 'xyz' is Latin script, so the reply comes back in English.
    expect(mockSendInvalidSelectionReply).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      'test-access-token',
      'phone-number-id-1',
      'en'
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
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('1'))
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendCancellationLessonList).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.stringContaining('השיעור שנבחר כבר לא זמין לביטול.'),
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

describe('WhatsApp automation toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
  })

  it('skips lead creation and reply when automation_new_leads_enabled is off', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            automation_new_leads_enabled: false,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: null, error: null }) // unknown sender
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('שיעור'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
  })

  it('skips the cancellation flow when automation_cancellation_enabled is off', async () => {
    mockGetActiveCancellationSession.mockResolvedValueOnce(null)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: {
            id: ORG_ID,
            whatsapp_access_token: 'encrypted-token',
            timezone: 'Asia/Jerusalem',
            automation_cancellation_enabled: false,
          },
          error: null,
        })
      }
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })

    const req = makeRequest(makeWebhookPayload('ביטול'))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockGetEligibleLessons).not.toHaveBeenCalled()
    expect(mockSendCancellationLessonList).not.toHaveBeenCalled()
    // Falls through to the unknown-intent path, which is now the menu
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })
})

describe('WhatsApp webhook hardening (Sprint 31 Story 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN
    mockIsRateLimited.mockResolvedValue(false)
    mockHasRecentUnreadSuperadminNotification.mockResolvedValue(false)
    mockClaimIncomingMessage.mockResolvedValue(true)
  })

  function mockKnownOrgAndParent() {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID }, error: null })
      return buildChain({ data: null, error: null })
    })
  }

  it('drops the message without claiming when the phone is rate limited', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockIsRateLimited.mockResolvedValue(true)
    mockKnownOrgAndParent()

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockIsRateLimited).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
    expect(mockClaimIncomingMessage).not.toHaveBeenCalled()
    expect(mockSendTextMessage).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('processes the message when the rate limit check fails open', async () => {
    mockIsRateLimited.mockResolvedValue(false)
    mockKnownOrgAndParent()

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockClaimIncomingMessage).toHaveBeenCalled()
  })

  it('escalates an unknown phone_number_id to Sentry + superadmin notification', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null })) // org not found

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    const res = await POST(req)
    // notifyUnroutablePhoneNumber is fire-and-forget — flush microtasks
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(res.status).toBe(200)
    expect(mockSentryCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'WhatsApp webhook: unknown phone_number_id' }),
      expect.objectContaining({ extra: expect.objectContaining({ phoneNumberId: 'phone-number-id-1' }) })
    )
    expect(mockNotifySuperadmins).toHaveBeenCalledWith(
      'webhook_unroutable',
      expect.any(String),
      expect.stringContaining('phone-number-id-1'),
      expect.any(String)
    )

    errorSpy.mockRestore()
  })

  it('throttles repeat superadmin notifications for the same phone_number_id', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockHasRecentUnreadSuperadminNotification.mockResolvedValue(true)
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    const req = makeRequest(makeWebhookPayload(NEUTRAL_TEXT))
    await POST(req)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockNotifySuperadmins).not.toHaveBeenCalled()
    // Sentry still fires — it dedupes by grouping on its own side
    expect(mockSentryCaptureException).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})

// ── Interactive menu ──────────────────────────────────────────────────────────

describe('WhatsApp interactive menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    mockDecryptToken.mockReturnValue('test-access-token')
    mockClaimIncomingMessage.mockResolvedValue(true)
    mockIsRateLimited.mockResolvedValue(false)
    mockGetActiveCancellationSession.mockResolvedValue(null)
    mockAiAssistantConfigured.mockReturnValue(false)
  })

  function orgAndParent(fullName: string | null = 'יעל לוי') {
    return (table: string) => {
      if (table === 'organizations') {
        return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      }
      if (table === 'parents') {
        return buildChain({ data: { id: PARENT_ID, full_name: fullName }, error: null })
      }
      return buildChain({ data: null, error: null })
    }
  }

  it('greets by first name and shows the menu instead of the text fallback', async () => {
    mockFrom.mockImplementation(orgAndParent('יעל לוי'))

    const res = await POST(makeRequest(makeWebhookPayload('היי')))
    expect(res.status).toBe(200)

    expect(mockSendListMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.objectContaining({ body: expect.stringContaining('יעל') }),
      'test-access-token',
      'phone-number-id-1'
    )
    // The greeting must not also trigger the AI assistant.
    expect(mockAiAssistant).not.toHaveBeenCalled()
  })

  it('routes a tapped menu row to the matching handler', async () => {
    mockFrom.mockImplementation(orgAndParent())

    const res = await POST(makeRequest(makeInteractivePayload('m:portal')))
    expect(res.status).toBe(200)

    expect(mockSendLinkReply).toHaveBeenCalledWith(
      expect.objectContaining({ templateType: 'portal_link_reply' })
    )
  })

  it('asks which student to book for when the parent has several', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID, full_name: 'יעל לוי' }, error: null })
      if (table === 'relationships') {
        const chain = buildChain(null) as Record<string, unknown>
        chain['select'] = () => chain
        chain['eq'] = () => chain
        chain['then'] = (r: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [
              { student_id: 'student-1', students: { id: 'student-1', full_name: 'דנה' } },
              { student_id: 'student-2', students: { id: 'student-2', full_name: 'יובל' } },
            ],
            error: null,
          }).then(r)
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeInteractivePayload('m:book')))
    expect(res.status).toBe(200)

    expect(mockSendReplyButtons).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      expect.objectContaining({
        buttons: [
          { id: 'm:book:student-1', title: 'דנה' },
          { id: 'm:book:student-2', title: 'יובל' },
        ],
      }),
      'test-access-token',
      'phone-number-id-1'
    )
    // No link yet — we are still asking who it is for.
    expect(mockSendLinkReply).not.toHaveBeenCalled()
  })

  it('books for the student named in the tapped payload', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID, full_name: 'יעל לוי' }, error: null })
      if (table === 'relationships') {
        const chain = buildChain(null) as Record<string, unknown>
        chain['select'] = () => chain
        chain['eq'] = () => chain
        chain['then'] = (r: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [
              { student_id: 'student-1', students: { id: 'student-1', full_name: 'דנה' } },
              { student_id: 'student-2', students: { id: 'student-2', full_name: 'יובל' } },
            ],
            error: null,
          }).then(r)
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeInteractivePayload('m:book:student-2')))
    expect(res.status).toBe(200)

    expect(mockSignBookingToken).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-2' })
    )
    expect(mockSendLinkReply).toHaveBeenCalledWith(
      expect.objectContaining({ templateType: 'booking_link' })
    )
  })

  it('refuses a student id that is not linked to this parent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' }, error: null })
      if (table === 'parents') return buildChain({ data: { id: PARENT_ID, full_name: 'יעל לוי' }, error: null })
      if (table === 'relationships') {
        const chain = buildChain(null) as Record<string, unknown>
        chain['select'] = () => chain
        chain['eq'] = () => chain
        chain['then'] = (r: (v: unknown) => unknown) =>
          Promise.resolve({
            data: [{ student_id: 'student-1', students: { id: 'student-1', full_name: 'דנה' } }],
            error: null,
          }).then(r)
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeInteractivePayload('m:book:someone-elses-child')))
    expect(res.status).toBe(200)

    expect(mockSignBookingToken).not.toHaveBeenCalled()
    expect(mockSendLinkReply).not.toHaveBeenCalled()
    expect(mockSendTextMessage).toHaveBeenCalled()
  })
})

// ── Sender role awareness ─────────────────────────────────────────────────────

/**
 * The webhook used to resolve every inbound phone against `parents` alone, so a
 * teacher, owner or student was indistinguishable from a cold prospect and got
 * filed as a sales lead. These cover who is recognised as what.
 */
describe('WhatsApp sender roles', () => {
  const TEACHER_ID = 'teacher-1'
  const PROFILE_ID = 'profile-1'

  const ORG_DATA = {
    id: ORG_ID,
    whatsapp_access_token: 'encrypted-token',
    timezone: 'Asia/Jerusalem',
    ai_assistant_enabled: false,
  }

  // parents is unique on (organization_id, phone) → maybeSingle, a single row.
  const PARENT_ROW = { data: { id: PARENT_ID, full_name: 'דנה', preferred_locale: 'he' }, error: null }
  // students.phone / profiles.phone have no uniqueness → limit(1) list results.
  const STUDENT_ROW = { data: [{ id: STUDENT_ID, full_name: 'יעל' }], error: null }
  const TEACHER_ROW = {
    data: [
      {
        id: TEACHER_ID,
        profile_id: PROFILE_ID,
        profiles: { id: PROFILE_ID, full_name: 'מיכל', preferred_locale: 'he' },
      },
    ],
    error: null,
  }
  const OWNER_ROW = {
    data: [{ id: PROFILE_ID, full_name: 'הדר', role: 'owner', preferred_locale: 'he' }],
    error: null,
  }

  /** Routes tables to canned results; anything unlisted resolves to empty. */
  function mockIdentity(tables: Record<string, unknown>, orgOverrides: Record<string, unknown> = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({ data: { ...ORG_DATA, ...orgOverrides }, error: null })
      }
      return buildChain(tables[table] ?? { data: null, error: null })
    })
  }

  /** The reply-id of every row in the menu that went out. */
  function menuRowIds(): string[] {
    const rows = mockSendListMessage.mock.calls[0][1].rows as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    mockClaimIncomingMessage.mockResolvedValue(true)
    mockReleaseIncomingMessageClaim.mockResolvedValue(undefined)
    mockIsRateLimited.mockResolvedValue(false)
    mockAiAssistantConfigured.mockReturnValue(false)
    mockGetActiveCancellationSession.mockResolvedValue(null)
    // clearAllMocks resets calls but keeps implementations, so a session set by
    // one support test would otherwise still be open in the next one.
    mockGetActiveSupportSession.mockResolvedValue(null)
    mockCreateTicket.mockResolvedValue('ticket-1')
  })

  it('recognises a student instead of filing them as a lead', async () => {
    mockIdentity({ students: STUDENT_ROW })

    const res = await POST(makeRequest(makeWebhookPayload('שלום')))

    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
  })

  it('offers a student their own lessons and homework, never balance or the portal', async () => {
    mockIdentity({ students: STUDENT_ROW })

    await POST(makeRequest(makeWebhookPayload('שלום')))

    // Booking and cancelling are the student's own lesson; what the family owes
    // is not theirs to see, and the portal has no student login path at all.
    expect(menuRowIds()).toEqual(['m:book', 'm:cancel', 'm:schedule', 'm:homework'])
    expect(menuRowIds()).not.toContain('m:balance')
    expect(menuRowIds()).not.toContain('m:portal')
  })

  it('refuses a student tapping a balance payload — reply ids come from the client', async () => {
    mockIdentity({ students: STUDENT_ROW })

    const res = await POST(makeRequest(makeInteractivePayload('m:balance')))

    expect(res.status).toBe(200)
    expect(mockSendLinkReply).not.toHaveBeenCalled()
    // Told it is unavailable, then shown what they can actually do.
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    expect(menuRowIds()).toEqual(['m:book', 'm:cancel', 'm:schedule', 'm:homework'])
  })

  it('recognises a teacher instead of filing them as a lead', async () => {
    mockIdentity({ teachers: TEACHER_ROW })

    const res = await POST(makeRequest(makeWebhookPayload('שלום')))

    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendUnknownParentReply).not.toHaveBeenCalled()
    expect(menuRowIds()).toEqual(['m:my_schedule', 'm:my_students', 'm:day_off', 'm:dashboard'])
  })

  it('does not file an owner as a lead on themselves', async () => {
    mockIdentity({ profiles: OWNER_ROW })

    const res = await POST(makeRequest(makeWebhookPayload('שלום')))

    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    // …and no "new lead" notification pointing them at /leads for themselves.
    expect(mockNotifyMultiple).not.toHaveBeenCalled()
    expect(menuRowIds()).toEqual([
      'm:today_summary',
      'm:pending_requests',
      'm:support',
      'm:dashboard',
    ])
  })

  // ── Support requests from the staff menu ────────────────────────────────────

  it('opens a support session and asks what happened', async () => {
    mockIdentity({ profiles: OWNER_ROW })

    const res = await POST(makeRequest(makeInteractivePayload('m:support')))

    expect(res.status).toBe(200)
    expect(mockStartSupportSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
    expect(mockCreateTicket).not.toHaveBeenCalled()
  })

  it('echoes the typed description back for confirmation instead of filing it', async () => {
    mockIdentity({ profiles: OWNER_ROW })
    mockGetActiveSupportSession.mockResolvedValue({
      id: 's1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      step: 'awaiting_description',
      draft_text: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    await POST(makeRequest(makeWebhookPayload('כפתור התשלום לא עובד')))

    expect(mockSetSupportDraft).toHaveBeenCalledWith(
      ORG_ID,
      SENDER_PHONE_E164,
      'כפתור התשלום לא עובד'
    )
    // Nothing is filed until they confirm — an unconfirmed draft is a
    // half-typed thought, not a ticket.
    expect(mockCreateTicket).not.toHaveBeenCalled()
    expect(mockSendReplyButtons).toHaveBeenCalledTimes(1)
  })

  it('files the ticket and ends the session when they confirm', async () => {
    mockIdentity({ profiles: OWNER_ROW })
    mockGetActiveSupportSession.mockResolvedValue({
      id: 's1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      step: 'awaiting_confirm',
      draft_text: 'כפתור התשלום לא עובד. ניסיתי פעמיים.',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    await POST(makeRequest(makeInteractivePayload('sup:send')))

    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        source: 'whatsapp',
        body: 'כפתור התשלום לא עובד. ניסיתי פעמיים.',
        // Subject is derived from the first sentence — WhatsApp has no subject line.
        subject: 'כפתור התשלום לא עובד.',
      })
    )
    expect(mockDeleteSupportSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
    expect(mockNotifySuperadmins).toHaveBeenCalled()
  })

  it('files nothing when they cancel', async () => {
    mockIdentity({ profiles: OWNER_ROW })
    mockGetActiveSupportSession.mockResolvedValue({
      id: 's1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      step: 'awaiting_confirm',
      draft_text: 'never mind',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    await POST(makeRequest(makeInteractivePayload('sup:cancel')))

    expect(mockCreateTicket).not.toHaveBeenCalled()
    expect(mockDeleteSupportSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
  })

  it('abandons an open support request when another menu row is tapped', async () => {
    mockIdentity({ profiles: OWNER_ROW })
    mockGetActiveSupportSession.mockResolvedValue({
      id: 's1',
      organization_id: ORG_ID,
      phone: SENDER_PHONE_E164,
      step: 'awaiting_description',
      draft_text: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    await POST(makeRequest(makeInteractivePayload('m:today_summary')))

    // The tap is a new intent, not the description of the open request.
    expect(mockDeleteSupportSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
    expect(mockSetSupportDraft).not.toHaveBeenCalled()
    expect(mockCreateTicket).not.toHaveBeenCalled()
  })

  it('leaves staff with no open session on their normal path', async () => {
    mockIdentity({ profiles: OWNER_ROW })
    mockGetActiveSupportSession.mockResolvedValue(null)

    await POST(makeRequest(makeWebhookPayload('מה יש היום')))

    expect(mockSetSupportDraft).not.toHaveBeenCalled()
    expect(mockCreateTicket).not.toHaveBeenCalled()
  })

  it('still files a genuinely unknown number as a lead', async () => {
    mockIdentity({})

    const res = await POST(makeRequest(makeWebhookPayload('אני מחפש מורה לחשבון')))

    expect(res.status).toBe(200)
    expect(mockUpsertLead).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164, 'אני מחפש מורה לחשבון')
    expect(mockSendUnknownParentReply).toHaveBeenCalled()
  })

  it('lets the lead toggle silence leads without silencing a teacher', async () => {
    mockIdentity({ teachers: TEACHER_ROW }, { automation_new_leads_enabled: false })

    const res = await POST(makeRequest(makeWebhookPayload('שלום')))

    expect(res.status).toBe(200)
    expect(mockUpsertLead).not.toHaveBeenCalled()
    expect(mockSendListMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps a parent-who-also-teaches on the parent menu, plus the switcher', async () => {
    mockIdentity({ parents: PARENT_ROW, teachers: TEACHER_ROW })

    await POST(makeRequest(makeWebhookPayload('שלום')))

    // Parent menu unchanged, with the switcher appended.
    expect(menuRowIds()).toEqual([
      'm:book',
      'm:cancel',
      'm:balance',
      'm:schedule',
      'm:portal',
      'm:switch_role',
    ])
  })

  it('never offers the switcher to a phone with a single capacity', async () => {
    mockIdentity({ parents: PARENT_ROW })

    await POST(makeRequest(makeWebhookPayload('שלום')))

    expect(menuRowIds()).not.toContain('m:switch_role')
  })

  it('offers every capacity held when switch_role is tapped', async () => {
    mockIdentity({ parents: PARENT_ROW, teachers: TEACHER_ROW })

    const res = await POST(makeRequest(makeInteractivePayload('m:switch_role')))

    expect(res.status).toBe(200)
    expect(mockSendReplyButtons).toHaveBeenCalledTimes(1)
    const buttons = mockSendReplyButtons.mock.calls[0][1].buttons as Array<{ id: string }>
    expect(buttons.map((b) => b.id)).toEqual(['r:parent', 'r:teacher'])
  })

  it('ignores a role pick the phone does not hold', async () => {
    mockIdentity({ parents: PARENT_ROW })

    const res = await POST(makeRequest(makeInteractivePayload('r:staff')))

    expect(res.status).toBe(200)
    // Falls back to the capacity they actually hold.
    expect(menuRowIds()).toContain('m:book')
  })

  /**
   * The sharpest case: homework-reminders and homework-sender already prefer
   * students.phone as the send target, so the bot was messaging students and
   * then answering their replies with "this number is not registered".
   */
  describe('a student replying to the homework reminder they were sent', () => {
    const OPEN_HOMEWORK = {
      data: [
        {
          id: 'hw-1',
          title: 'תרגילים 12-14',
          student_id: STUDENT_ID,
          teacher_id: TEACHER_ID,
          due_date: '2026-08-20',
        },
      ],
      error: null,
    }

    it('marks it done and confirms to the student', async () => {
      mockIdentity({ students: STUDENT_ROW, homework_assignments: OPEN_HOMEWORK })

      const res = await POST(makeRequest(makeWebhookPayload('סיימתי')))

      expect(res.status).toBe(200)
      expect(mockUpsertLead).not.toHaveBeenCalled()
      expect(mockMarkAssignmentDone).toHaveBeenCalledWith({
        assignmentId: 'hw-1',
        organizationId: ORG_ID,
      })
      // Confirmation names the assignment, addressed to the student.
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        SENDER_PHONE_E164,
        expect.stringContaining('תרגילים 12-14'),
        'test-access-token',
        'phone-number-id-1'
      )
    })

    it('tells the teacher the student marked it, not the parent', async () => {
      mockIdentity({
        students: STUDENT_ROW,
        homework_assignments: OPEN_HOMEWORK,
        teachers: {
          data: { profiles: { phone: '+972529999999', preferred_locale: 'en' } },
          error: null,
        },
      })

      await POST(makeRequest(makeWebhookPayload('סיימתי')))

      // In the teacher's own UI language, and worded as the student reporting —
      // a teacher reads "the student marked it" differently from "the parent did".
      expect(mockSendHomeworkAlert).toHaveBeenCalledWith(
        '+972529999999',
        'יעל',
        'תרגילים 12-14',
        'test-access-token',
        'phone-number-id-1',
        'en',
        'student'
      )
    })

    it('does not alert a teacher who has no phone on file', async () => {
      mockIdentity({
        students: STUDENT_ROW,
        homework_assignments: OPEN_HOMEWORK,
        teachers: { data: { profiles: { phone: null, preferred_locale: 'he' } }, error: null },
      })

      await POST(makeRequest(makeWebhookPayload('סיימתי')))

      expect(mockSendHomeworkAlert).not.toHaveBeenCalled()
      // The student is still confirmed — the missing phone is not their problem.
      expect(mockMarkAssignmentDone).toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('reads "סיימתי את השיעורים" as done, not as a schedule query', async () => {
      // The bare-שיעורים schedule keyword matches this too; for a student
      // answering a homework reminder, done has to win.
      mockIdentity({ students: STUDENT_ROW, homework_assignments: OPEN_HOMEWORK })

      await POST(makeRequest(makeWebhookPayload('סיימתי את השיעורים')))

      expect(mockMarkAssignmentDone).toHaveBeenCalledWith({
        assignmentId: 'hw-1',
        organizationId: ORG_ID,
      })
    })

    it('says so plainly when nothing is open', async () => {
      mockIdentity({ students: STUDENT_ROW, homework_assignments: { data: [], error: null } })

      const res = await POST(makeRequest(makeWebhookPayload('סיימתי')))

      expect(res.status).toBe(200)
      expect(mockMarkAssignmentDone).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('lists the open homework when the menu row is tapped', async () => {
      mockIdentity({ students: STUDENT_ROW, homework_assignments: OPEN_HOMEWORK })

      const res = await POST(makeRequest(makeInteractivePayload('m:homework')))

      expect(res.status).toBe(200)
      expect(mockMarkAssignmentDone).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        SENDER_PHONE_E164,
        expect.stringContaining('תרגילים 12-14'),
        'test-access-token',
        'phone-number-id-1'
      )
    })
  })

  /**
   * A student books and cancels their own lesson, but never their own account:
   * the booking token carries a parent id and a cancellation charge is created
   * against a parent, so both run through the billing parent — who is copied on
   * the confirmation rather than finding out from the next invoice.
   */
  describe('a student booking or cancelling their own lesson', () => {
    const PARENT_PHONE = '+972521111111'

    /** relationships → the student's active parent, primary first. */
    const BILLING_PARENT = {
      data: [
        {
          is_primary: true,
          parents: { id: PARENT_ID, phone: PARENT_PHONE, preferred_locale: 'he' },
        },
      ],
      error: null,
    }

    it('signs a booking link for the student against their billing parent', async () => {
      mockIdentity({ students: STUDENT_ROW, relationships: BILLING_PARENT })

      const res = await POST(makeRequest(makeInteractivePayload('m:book')))

      expect(res.status).toBe(200)
      expect(mockSignBookingToken).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        parentId: PARENT_ID,
        studentId: STUDENT_ID,
      })
      expect(mockSendLinkReply).toHaveBeenCalledWith(
        expect.objectContaining({ templateType: 'booking_link', to: SENDER_PHONE_E164 })
      )
    })

    it('signs nothing when the student has no parent linked', async () => {
      mockIdentity({ students: STUDENT_ROW, relationships: { data: [], error: null } })

      const res = await POST(makeRequest(makeInteractivePayload('m:book')))

      expect(res.status).toBe(200)
      expect(mockSignBookingToken).not.toHaveBeenCalled()
      expect(mockSendLinkReply).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('narrows the cancellation list to the student themselves, never a sibling', async () => {
      mockIdentity({ students: STUDENT_ROW, relationships: BILLING_PARENT })
      mockGetEligibleLessons.mockResolvedValue([
        { id: 'lesson-1', start_at: '2026-08-20T10:00:00Z', student_name: 'יעל', teacher_name: 'מיכל' },
      ])

      const res = await POST(makeRequest(makeInteractivePayload('m:cancel')))

      expect(res.status).toBe(200)
      expect(mockGetEligibleLessons).toHaveBeenCalledWith(ORG_ID, PARENT_ID, [STUDENT_ID])
      expect(mockUpsertCancellationSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164, [
        'lesson-1',
      ])
      expect(mockSendCancellationLessonList).toHaveBeenCalled()
    })

    it('honours the org switch that turns cancellations off', async () => {
      mockIdentity(
        { students: STUDENT_ROW, relationships: BILLING_PARENT },
        { automation_cancellation_enabled: false }
      )

      await POST(makeRequest(makeInteractivePayload('m:cancel')))

      expect(mockGetEligibleLessons).not.toHaveBeenCalled()
      expect(mockUpsertCancellationSession).not.toHaveBeenCalled()
    })

    it('reads a bare number as a lesson pick and copies the parent in', async () => {
      mockIdentity({ students: STUDENT_ROW, relationships: BILLING_PARENT })
      mockGetActiveCancellationSession.mockResolvedValue({
        id: 'session-1',
        organization_id: ORG_ID,
        phone: SENDER_PHONE_E164,
        lesson_ids: ['lesson-1'],
        expires_at: '2099-01-01T00:00:00Z',
      })
      mockExecuteCancellation.mockResolvedValue({
        success: true,
        lessonStartAt: '2026-08-20T10:00:00Z',
        studentName: 'יעל',
        teacherName: 'מיכל',
        chargeResult: { shouldCharge: false, amount: 0, chargeType: null, reasonCode: 'no_policy' },
      })

      const res = await POST(makeRequest(makeWebhookPayload('1')))

      expect(res.status).toBe(200)
      // Authorised through the parent relationship, not the student's say-so.
      expect(mockExecuteCancellation).toHaveBeenCalledWith('lesson-1', PARENT_ID, ORG_ID)
      expect(mockDeleteCancellationSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
      // The student is confirmed…
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        SENDER_PHONE_E164,
        expect.any(String),
        'test-access-token',
        'phone-number-id-1'
      )
      // …and the parent, who carries the charge, is told who did it.
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        PARENT_PHONE,
        expect.stringContaining('יעל'),
        'test-access-token',
        'phone-number-id-1'
      )
    })

    it('does not cancel on a number that is not on the list', async () => {
      mockIdentity({ students: STUDENT_ROW, relationships: BILLING_PARENT })
      mockGetActiveCancellationSession.mockResolvedValue({
        id: 'session-1',
        organization_id: ORG_ID,
        phone: SENDER_PHONE_E164,
        lesson_ids: ['lesson-1'],
        expires_at: '2099-01-01T00:00:00Z',
      })
      mockGetEligibleLessons.mockResolvedValue([
        { id: 'lesson-1', start_at: '2026-08-20T10:00:00Z', student_name: 'יעל', teacher_name: 'מיכל' },
      ])

      await POST(makeRequest(makeWebhookPayload('7')))

      expect(mockExecuteCancellation).not.toHaveBeenCalled()
      // The flow stays open with a freshly rebuilt list.
      expect(mockSendInvalidSelectionReply).toHaveBeenCalled()
      expect(mockSendCancellationLessonList).toHaveBeenCalled()
    })
  })

  /**
   * A teacher asking for time off, and an owner deciding on it. The teacher's
   * tap files a request and nothing more — the approval gate is what makes a
   * write path safe on a channel with no confirmation step.
   */
  describe('a teacher requesting time off', () => {
    const REQUEST_ID = '0142401d-89d0-47ad-bd3f-20edfb4ca444'

    /** An ISO date `days` from today, so payloads stay in the future as time passes. */
    function isoDaysFromNow(days: number): string {
      const d = new Date()
      d.setDate(d.getDate() + days)
      return d.toISOString().slice(0, 10)
    }

    /** The reply ids of every row in the interactive list that went out. */
    function listRowIds(): string[] {
      const rows = mockSendListMessage.mock.calls[0][1].rows as Array<{ id: string }>
      return rows.map((r) => r.id)
    }

    it('offers a run of dates to pick from, plus paging and a way out', async () => {
      mockIdentity({ teachers: TEACHER_ROW })

      const res = await POST(makeRequest(makeInteractivePayload('m:day_off')))

      expect(res.status).toBe(200)
      const ids = listRowIds()
      expect(ids.filter((id) => id.startsWith('d:start:'))).toHaveLength(8)
      expect(ids).toContain('d:pick:8')
      expect(ids).toContain('d:abort')
    })

    it('offers "just one day" as the first end-date option', async () => {
      mockIdentity({ teachers: TEACHER_ROW })
      const start = isoDaysFromNow(3)

      await POST(makeRequest(makeInteractivePayload(`d:start:${start}`)))

      const ids = listRowIds()
      expect(ids[0]).toBe(`d:end:${start}:${start}`)
      expect(ids).toContain('d:abort')
    })

    it('confirms before filing anything', async () => {
      mockIdentity({ teachers: TEACHER_ROW })
      const start = isoDaysFromNow(3)
      const end = isoDaysFromNow(5)

      await POST(makeRequest(makeInteractivePayload(`d:end:${start}:${end}`)))

      // Still just a question — nothing is filed until they confirm.
      expect(mockCreateDayOffRequest).not.toHaveBeenCalled()
      const buttons = mockSendReplyButtons.mock.calls[0][1].buttons as Array<{ id: string }>
      expect(buttons.map((b) => b.id)).toEqual([`d:confirm:${start}:${end}`, 'd:abort'])
    })

    it('files the request against the sender’s own teacher id and alerts staff', async () => {
      mockIdentity({ teachers: TEACHER_ROW })
      const start = isoDaysFromNow(3)
      const end = isoDaysFromNow(5)
      mockCreateDayOffRequest.mockResolvedValue({
        ok: true,
        request: {
          id: REQUEST_ID,
          organizationId: ORG_ID,
          teacherId: TEACHER_ID,
          startDate: start,
          endDate: end,
          status: 'pending',
          teacherName: 'מיכל',
        },
      })
      mockCountLessonsInRange.mockResolvedValue(4)

      const res = await POST(makeRequest(makeInteractivePayload(`d:confirm:${start}:${end}`)))

      expect(res.status).toBe(200)
      expect(mockCreateDayOffRequest).toHaveBeenCalledWith({
        orgId: ORG_ID,
        teacherId: TEACHER_ID,
        startDate: start,
        endDate: end,
      })
      // The owner is told what approving would cost before they decide.
      expect(mockNotifyStaffOfRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: REQUEST_ID }),
        expect.objectContaining({ orgId: ORG_ID }),
        4
      )
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('says so plainly when a request is already waiting', async () => {
      mockIdentity({ teachers: TEACHER_ROW })
      mockCreateDayOffRequest.mockResolvedValue({ ok: false, reason: 'already_pending' })

      await POST(
        makeRequest(makeInteractivePayload(`d:confirm:${isoDaysFromNow(3)}:${isoDaysFromNow(3)}`))
      )

      expect(mockNotifyStaffOfRequest).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('files nothing from a stale list whose dates have passed', async () => {
      // The list stays tappable long after its dates stop being bookable.
      mockIdentity({ teachers: TEACHER_ROW })

      const res = await POST(makeRequest(makeInteractivePayload('d:confirm:2020-01-01:2020-01-02')))

      expect(res.status).toBe(200)
      expect(mockCreateDayOffRequest).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('links a teacher to their own shell, not the owner dashboard', async () => {
      mockIdentity({ teachers: TEACHER_ROW })

      await POST(makeRequest(makeInteractivePayload('m:dashboard')))

      expect(mockSendTextMessage).toHaveBeenCalledWith(
        SENDER_PHONE_E164,
        expect.stringContaining('/teacher/schedule'),
        'test-access-token',
        'phone-number-id-1'
      )
    })

    it('ignores a day-off payload echoed back by a parent', async () => {
      // Reply ids are client-supplied; the parent path must not decode them.
      mockIdentity({ parents: PARENT_ROW })

      const res = await POST(
        makeRequest(makeInteractivePayload(`d:confirm:${isoDaysFromNow(3)}:${isoDaysFromNow(4)}`))
      )

      expect(res.status).toBe(200)
      expect(mockCreateDayOffRequest).not.toHaveBeenCalled()
    })
  })

  describe('an owner deciding on a time-off request', () => {
    const REQUEST_ID = '0142401d-89d0-47ad-bd3f-20edfb4ca444'

    const PENDING = {
      id: REQUEST_ID,
      organizationId: ORG_ID,
      teacherId: TEACHER_ID,
      startDate: '2026-08-20',
      endDate: '2026-08-22',
      status: 'pending' as const,
      teacherName: 'מיכל',
    }

    it('lists what is waiting, one row per request', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockGetPendingRequests.mockResolvedValue([PENDING])

      const res = await POST(makeRequest(makeInteractivePayload('m:pending_requests')))

      expect(res.status).toBe(200)
      const rows = mockSendListMessage.mock.calls[0][1].rows as Array<{ id: string; title: string }>
      expect(rows).toEqual([
        expect.objectContaining({ id: `a:show:${REQUEST_ID}`, title: 'מיכל' }),
      ])
    })

    it('says so when nothing is waiting', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockGetPendingRequests.mockResolvedValue([])

      await POST(makeRequest(makeInteractivePayload('m:pending_requests')))

      expect(mockSendListMessage).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('shows the cost before offering the two buttons', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockGetRequestById.mockResolvedValue(PENDING)
      mockCountLessonsInRange.mockResolvedValue(6)

      await POST(makeRequest(makeInteractivePayload(`a:show:${REQUEST_ID}`)))

      const call = mockSendReplyButtons.mock.calls[0][1]
      expect(call.body).toContain('6')
      expect((call.buttons as Array<{ id: string }>).map((b) => b.id)).toEqual([
        `a:approve:${REQUEST_ID}`,
        `a:reject:${REQUEST_ID}`,
      ])
    })

    it('approves against the owner’s own profile and org', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockApproveDayOffRequest.mockResolvedValue({
        status: 'approved',
        request: PENDING,
        lessonsCancelled: 3,
        parentsNotified: 2,
        parentsFailed: 0,
      })

      const res = await POST(makeRequest(makeInteractivePayload(`a:approve:${REQUEST_ID}`)))

      expect(res.status).toBe(200)
      expect(mockApproveDayOffRequest).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        decidedByProfileId: PROFILE_ID,
        ctx: expect.objectContaining({ orgId: ORG_ID, accessToken: 'test-access-token' }),
      })
      // The reply reports what actually happened, not just "done".
      expect(mockSendTextMessage).toHaveBeenCalledWith(
        SENDER_PHONE_E164,
        expect.stringContaining('3'),
        'test-access-token',
        'phone-number-id-1'
      )
    })

    it('rejects without touching a lesson', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockRejectDayOffRequest.mockResolvedValue({ status: 'rejected', request: PENDING })

      await POST(makeRequest(makeInteractivePayload(`a:reject:${REQUEST_ID}`)))

      expect(mockRejectDayOffRequest).toHaveBeenCalled()
      expect(mockApproveDayOffRequest).not.toHaveBeenCalled()
    })

    it('tells the second admin the request was already handled', async () => {
      mockIdentity({ profiles: OWNER_ROW })
      mockApproveDayOffRequest.mockResolvedValue({ status: 'already_decided' })

      const res = await POST(makeRequest(makeInteractivePayload(`a:approve:${REQUEST_ID}`)))

      expect(res.status).toBe(200)
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1)
    })

    it('refuses a decision payload tapped by a teacher', async () => {
      // A teacher could echo back an approve payload they were never shown.
      mockIdentity({ teachers: TEACHER_ROW })

      const res = await POST(makeRequest(makeInteractivePayload(`a:approve:${REQUEST_ID}`)))

      expect(res.status).toBe(200)
      expect(mockApproveDayOffRequest).not.toHaveBeenCalled()
    })
  })
})

describe('WhatsApp opt-out', () => {
  const ORG_DATA = {
    id: ORG_ID,
    whatsapp_access_token: 'encrypted-token',
    timezone: 'Asia/Jerusalem',
    ai_assistant_enabled: false,
  }

  /** `parents` serves both resolveSender and the opt-out lookup. */
  function mockParent(overrides: Record<string, unknown> = {}, orgOverrides: Record<string, unknown> = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({ data: { ...ORG_DATA, ...orgOverrides }, error: null })
      }
      if (table === 'parents') {
        return buildChain({
          data: { id: PARENT_ID, full_name: 'דנה', preferred_locale: 'he', opted_out_at: null, ...overrides },
          error: null,
        })
      }
      return buildChain({ data: null, error: null })
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    mockClaimIncomingMessage.mockResolvedValue(true)
    mockReleaseIncomingMessageClaim.mockResolvedValue(undefined)
    mockIsRateLimited.mockResolvedValue(false)
    mockAiAssistantConfigured.mockReturnValue(false)
    mockGetActiveCancellationSession.mockResolvedValue(null)
  })

  it('confirms the opt-out and stops there', async () => {
    mockParent()

    const res = await POST(makeRequest(makeWebhookPayload('הסר')))

    expect(res.status).toBe(200)
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_out_confirmed', 'he'),
      'test-access-token',
      'phone-number-id-1'
    )
    // No menu, no AI, no intent handling — the stop word is the whole message.
    expect(mockSendListMessage).not.toHaveBeenCalled()
    expect(mockAiAssistant).not.toHaveBeenCalled()
  })

  // The stop word is itself a language signal, and the usual rule is that the
  // script of the message being answered outranks the stored preference — so a
  // Hebrew-speaking parent who types the English "stop" gets an English answer.
  it('answers in the language of the stop word, not the stored preference', async () => {
    mockParent({ preferred_locale: 'he' })

    await POST(makeRequest(makeWebhookPayload('stop')))

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_out_confirmed', 'en'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('says so when the parent had already opted out', async () => {
    mockParent({ opted_out_at: '2026-08-01T09:00:00Z' })

    await POST(makeRequest(makeWebhookPayload('הסר')))

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_out_already', 'he'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('clears a cancellation session, so a stop word works mid-flow', async () => {
    mockParent()

    await POST(makeRequest(makeWebhookPayload('stop')))

    expect(mockDeleteCancellationSession).toHaveBeenCalledWith(ORG_ID, SENDER_PHONE_E164)
  })

  it('turns messages back on for an opted-out parent', async () => {
    mockParent({ opted_out_at: '2026-08-01T09:00:00Z' })

    await POST(makeRequest(makeWebhookPayload('start')))

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_in_confirmed', 'en'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('tells a parent who never opted out that nothing changed', async () => {
    mockParent()

    await POST(makeRequest(makeWebhookPayload('התחל')))

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_in_already', 'he'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('ignores a tapped row whose label happens to read "stop"', async () => {
    // Reply ids come from the client; a title is not consent to unsubscribe.
    mockParent()

    const res = await POST(makeRequest(makeInteractivePayload('m:schedule', 'stop')))

    expect(res.status).toBe(200)
    expect(mockSendTextMessage).not.toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_out_confirmed', 'he'),
      'test-access-token',
      'phone-number-id-1'
    )
  })

  it('does not treat a sentence containing "stop" as an opt-out', async () => {
    mockParent()

    await POST(makeRequest(makeWebhookPayload('can you stop the 8am reminder only?')))

    expect(mockSendTextMessage).not.toHaveBeenCalledWith(
      SENDER_PHONE_E164,
      botString('opt_out_confirmed', 'he'),
      'test-access-token',
      'phone-number-id-1'
    )
  })
})

// ── Template approval status ──────────────────────────────────────────────────

describe('POST /api/whatsapp/webhook — template status updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_APP_SECRET = APP_SECRET
    mockIsRateLimited.mockResolvedValue(false)
    mockClaimIncomingMessage.mockResolvedValue(true)
  })

  function makeStatusPayload(overrides: Record<string, unknown> = {}) {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-1',
        changes: [{
          field: 'message_template_status_update',
          value: {
            event: 'APPROVED',
            message_template_id: 987,
            message_template_name: 'lessio_lesson_reminder_en_c1',
            message_template_language: 'en',
            reason: 'NONE',
            ...overrides,
          },
        }],
      }],
    }
  }

  it('records the new status against the org that owns the WABA', async () => {
    const upsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID }, error: null })
      if (table === 'whatsapp_template_statuses') return { upsert }
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeStatusPayload()))

    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        template_name: 'lessio_lesson_reminder_en_c1',
        language: 'en',
        status: 'APPROVED',
        reason: null,
      }),
      { onConflict: 'organization_id,template_name,language' }
    )
  })

  it('stores the rejection reason Meta gave', async () => {
    const upsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: { id: ORG_ID }, error: null })
      if (table === 'whatsapp_template_statuses') return { upsert }
      return buildChain({ data: null, error: null })
    })

    await POST(makeRequest(makeStatusPayload({ event: 'REJECTED', reason: 'INVALID_FORMAT' })))

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED', reason: 'INVALID_FORMAT' }),
      expect.anything()
    )
  })

  it('ignores a status update for a WABA we do not know, still returning 200', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const upsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') return buildChain({ data: null, error: null })
      if (table === 'whatsapp_template_statuses') return { upsert }
      return buildChain({ data: null, error: null })
    })

    const res = await POST(makeRequest(makeStatusPayload()))

    expect(res.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  // Regression for the schema fix: a status change used to fail the whole
  // safeParse, silently dropping any real message batched alongside it.
  it('still handles an inbound message batched with a status change', async () => {
    const upsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return buildChain({
          data: { id: ORG_ID, whatsapp_access_token: 'encrypted-token', timezone: 'Asia/Jerusalem' },
          error: null,
        })
      }
      if (table === 'whatsapp_template_statuses') return { upsert }
      return buildChain({ data: null, error: null })
    })

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-1',
        changes: [
          makeStatusPayload().entry[0].changes[0],
          makeWebhookPayload(NEUTRAL_TEXT).entry[0].changes[0],
        ],
      }],
    }

    const res = await POST(makeRequest(payload))

    expect(res.status).toBe(200)
    // The message reached the pipeline: an unknown sender becomes a lead.
    expect(mockSendUnknownParentReply).toHaveBeenCalled()
    expect(upsert).toHaveBeenCalled()
  })
})
