import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn().mockReturnValue('test-token'),
}))

vi.mock('@/lib/jwt', async () => {
  const actual = await vi.importActual('@/lib/jwt')
  return {
    ...actual,
    verifyBookingToken: vi.fn(),
    signBookingToken: vi.fn(),
  }
})

vi.mock('@/lib/booking', async () => {
  const actual = await vi.importActual('@/lib/booking')
  return {
    ...actual,
    getAvailableSlots: vi.fn(),
    getAvailabilitySummary: vi.fn(),
    createSlotLock: vi.fn(),
    confirmBooking: vi.fn(),
  }
})

vi.mock('@/lib/whatsapp', async () => {
  const actual = await vi.importActual('@/lib/whatsapp')
  return {
    ...actual,
    sendTextMessage: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/whatsapp/templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue('מורה: ישראל ישראלי'),
}))

import { verifyBookingToken, BookingTokenError } from '@/lib/jwt'
import {
  confirmBooking,
  getAvailabilitySummary,
  LockExpiredError,
  NoPrimaryParentError,
  InactiveParticipantError,
} from '@/lib/booking'
import { sendTextMessage } from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { confirmBookingAction, getAvailabilitySummaryAction } from './actions'

const mockVerify = vi.mocked(verifyBookingToken)
const mockConfirmBooking = vi.mocked(confirmBooking)
const mockGetAvailabilitySummary = vi.mocked(getAvailabilitySummary)
const mockSendTextMessage = vi.mocked(sendTextMessage)
const mockResolveTemplate = vi.mocked(resolveTemplate)

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN = 'valid-jwt-token'
const LOCK_ID = 'lock-1'
const TEACHER_ID = 'teacher-1'
const STUDENT_ID = 'student-1'
const PARENT_ID = 'parent-1'
const ORG_ID = 'org-1'
const START_AT = '2026-03-23T16:00:00.000Z'
const END_AT = '2026-03-23T17:00:00.000Z'
const PARENT_PHONE = '+972501234567'
const TEACHER_NAME = 'ישראל ישראלי'

const BOOKING_RESULT = {
  lessonId: 'lesson-1',
  teacherId: TEACHER_ID,
  studentId: STUDENT_ID,
  startAt: START_AT,
  endAt: END_AT,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach(m => { self[m] = pass })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  return self
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('confirmBookingAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id'

    mockVerify.mockResolvedValue({ organizationId: ORG_ID, parentId: PARENT_ID, studentId: STUDENT_ID })
  })

  it('returns success and triggers WhatsApp confirmation on successful booking', async () => {
    mockConfirmBooking.mockResolvedValue(BOOKING_RESULT)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'parents') return buildChain({ data: { phone: PARENT_PHONE }, error: null })
      if (table === 'teachers') return buildChain({ data: { profiles: { full_name: TEACHER_NAME } }, error: null })
      if (table === 'organizations') return buildChain({
        data: { whatsapp_phone_number_id: 'test-phone-id', whatsapp_access_token: 'encrypted-test-token' },
        error: null,
      })
      return buildChain({ data: null, error: null })
    })

    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.result.lessonId).toBe('lesson-1')
    }

    // Wait for fire-and-forget to settle
    await new Promise(r => setTimeout(r, 10))
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PARENT_PHONE,
      expect.stringContaining('ישראל ישראלי'),
      'test-token',
      'test-phone-id'
    )
  })

  it('sends the confirmation in English when the WebView locale is en', async () => {
    mockConfirmBooking.mockResolvedValue(BOOKING_RESULT)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'parents') return buildChain({ data: { phone: PARENT_PHONE, preferred_locale: 'he' }, error: null })
      if (table === 'teachers') return buildChain({ data: { profiles: { full_name: TEACHER_NAME } }, error: null })
      if (table === 'organizations') return buildChain({
        data: { whatsapp_phone_number_id: 'test-phone-id', whatsapp_access_token: 'encrypted-test-token' },
        error: null,
      })
      return buildChain({ data: null, error: null })
    })

    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID, 'en')

    expect(result.success).toBe(true)

    // The live booking language outranks the stored Hebrew preference
    await new Promise(r => setTimeout(r, 10))
    expect(mockResolveTemplate).toHaveBeenCalledWith(
      ORG_ID,
      'booking_confirmation',
      expect.any(Object),
      'en'
    )
    expect(mockSendTextMessage).toHaveBeenCalled()
  })

  it('returns success even if WhatsApp confirmation send fails', async () => {
    mockConfirmBooking.mockResolvedValue(BOOKING_RESULT)
    mockSendTextMessage.mockRejectedValueOnce(new Error('Meta API down'))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'parents') return buildChain({ data: { phone: PARENT_PHONE }, error: null })
      if (table === 'teachers') return buildChain({ data: { profiles: { full_name: TEACHER_NAME } }, error: null })
      if (table === 'organizations') return buildChain({
        data: { whatsapp_phone_number_id: 'test-phone-id', whatsapp_access_token: 'encrypted-test-token' },
        error: null,
      })
      return buildChain({ data: null, error: null })
    })

    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)

    // Booking must succeed even if WhatsApp fails
    expect(result.success).toBe(true)
  })

  it('returns lock_expired error when LockExpiredError is thrown', async () => {
    mockConfirmBooking.mockRejectedValue(new LockExpiredError('expired'))
    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('lock_expired')
  })

  it('returns inactive_participant error when InactiveParticipantError is thrown', async () => {
    mockConfirmBooking.mockRejectedValue(new InactiveParticipantError('teacher'))
    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('inactive_participant')
  })

  it('returns no_primary_parent error when NoPrimaryParentError is thrown', async () => {
    mockConfirmBooking.mockRejectedValue(new NoPrimaryParentError())
    const result = await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('no_primary_parent')
  })

  it('does not send WhatsApp confirmation when booking fails', async () => {
    mockConfirmBooking.mockRejectedValue(new LockExpiredError('expired'))
    await confirmBookingAction(TOKEN, LOCK_ID, TEACHER_ID)

    await new Promise(r => setTimeout(r, 10))
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })
})

describe('getAvailabilitySummaryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue({ organizationId: ORG_ID, parentId: PARENT_ID, studentId: STUDENT_ID })
  })

  it('verifies the token and delegates to the weekly availability summary helper', async () => {
    mockGetAvailabilitySummary.mockResolvedValue({
      weekStart: '2026-03-22',
      timezone: 'UTC',
      durationMinutes: 60,
      days: [],
    })

    const result = await getAvailabilitySummaryAction(TOKEN, TEACHER_ID, 60, '2026-03-24')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.weekStart).toBe('2026-03-22')
    }
    expect(mockGetAvailabilitySummary).toHaveBeenCalledWith({
      teacherId: TEACHER_ID,
      organizationId: ORG_ID,
      durationMinutes: 60,
      weekStart: '2026-03-24',
    })
  })

  it('returns token_expired when the booking token has expired', async () => {
    mockVerify.mockRejectedValue(new BookingTokenError('Booking link has expired', 'expired'))

    const result = await getAvailabilitySummaryAction(TOKEN, TEACHER_ID, 60)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('token_expired')
    expect(mockGetAvailabilitySummary).not.toHaveBeenCalled()
  })
})
