import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetWeeklyQuotaStatus, mockGetEligibleLessons, mockSendReplyButtons, mockSendTextMessage, mockStudentDisplayName } = vi.hoisted(() => ({
  mockGetWeeklyQuotaStatus: vi.fn(),
  mockGetEligibleLessons: vi.fn(),
  mockSendReplyButtons: vi.fn().mockResolvedValue(undefined),
  mockSendTextMessage: vi.fn().mockResolvedValue(undefined),
  mockStudentDisplayName: vi.fn().mockResolvedValue('נועה'),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { timezone: 'Asia/Jerusalem' }, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/booking', () => ({ getWeeklyQuotaStatus: mockGetWeeklyQuotaStatus }))
vi.mock('@/lib/cancellation-flow', () => ({ getEligibleLessons: mockGetEligibleLessons }))
vi.mock('@/lib/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp')>()),
  sendTextMessage: mockSendTextMessage,
}))
vi.mock('@/lib/whatsapp/interactive', () => ({ sendReplyButtons: mockSendReplyButtons }))
vi.mock('./shared', () => ({ studentDisplayName: mockStudentDisplayName }))

import { notifyIfWeeklyQuotaReached } from './bookingQuotaNotice'

const PARAMS = {
  orgId: 'org-1',
  parentId: 'parent-1',
  studentId: 'student-1',
  senderPhone: '972500000000',
  accessToken: 'token',
  phoneNumberId: 'phone-1',
  locale: 'he' as const,
}

describe('notifyIfWeeklyQuotaReached', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEligibleLessons.mockResolvedValue([{ id: 'lesson-1' }])
  })

  it('stays quiet while the student still has room this week', async () => {
    mockGetWeeklyQuotaStatus.mockResolvedValue({ quota: 2, count: 1, atQuota: false })

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toEqual({ atQuota: false })
    expect(mockSendReplyButtons).not.toHaveBeenCalled()
  })

  it('offers a cancel button that enters the existing cancellation flow', async () => {
    mockGetWeeklyQuotaStatus.mockResolvedValue({ quota: 1, count: 1, atQuota: true })

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toMatchObject({ atQuota: true })

    const [to, opts] = mockSendReplyButtons.mock.calls[0]
    expect(to).toBe(PARAMS.senderPhone)
    expect(opts.body).toContain('נועה')
    expect(opts.buttons).toEqual([{ id: 'm:cancel', title: 'ביטול שיעור' }])
  })

  it('does not offer cancellation when only a past lesson consumed the quota', async () => {
    mockGetWeeklyQuotaStatus.mockResolvedValue({ quota: 1, count: 1, atQuota: true })
    mockGetEligibleLessons.mockResolvedValue([])

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toMatchObject({ atQuota: true })
    expect(mockSendReplyButtons).not.toHaveBeenCalled()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PARAMS.senderPhone,
      expect.stringContaining('כבר התקיים'),
      PARAMS.accessToken,
      PARAMS.phoneNumberId
    )
  })

  it('never costs the parent their booking link when the check itself fails', async () => {
    mockGetWeeklyQuotaStatus.mockRejectedValue(new Error('db down'))

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toEqual({ atQuota: false })
    expect(mockSendReplyButtons).not.toHaveBeenCalled()
  })
})
