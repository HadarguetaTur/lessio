import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetWeeklyQuotaStatus, mockSendReplyButtons, mockStudentDisplayName } = vi.hoisted(() => ({
  mockGetWeeklyQuotaStatus: vi.fn(),
  mockSendReplyButtons: vi.fn().mockResolvedValue(undefined),
  mockStudentDisplayName: vi.fn().mockResolvedValue('נועה'),
}))

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/lib/booking', () => ({ getWeeklyQuotaStatus: mockGetWeeklyQuotaStatus }))
vi.mock('@/lib/whatsapp/interactive', () => ({ sendReplyButtons: mockSendReplyButtons }))
vi.mock('./shared', () => ({ studentDisplayName: mockStudentDisplayName }))

import { notifyIfWeeklyQuotaReached } from './bookingQuotaNotice'

const PARAMS = {
  orgId: 'org-1',
  studentId: 'student-1',
  senderPhone: '972500000000',
  accessToken: 'token',
  phoneNumberId: 'phone-1',
  locale: 'he' as const,
}

describe('notifyIfWeeklyQuotaReached', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stays quiet while the student still has room this week', async () => {
    mockGetWeeklyQuotaStatus.mockResolvedValue({ quota: 2, count: 1, atQuota: false })

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toBe(false)
    expect(mockSendReplyButtons).not.toHaveBeenCalled()
  })

  it('offers a cancel button that enters the existing cancellation flow', async () => {
    mockGetWeeklyQuotaStatus.mockResolvedValue({ quota: 1, count: 1, atQuota: true })

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toBe(true)

    const [to, opts] = mockSendReplyButtons.mock.calls[0]
    expect(to).toBe(PARAMS.senderPhone)
    expect(opts.body).toContain('נועה')
    expect(opts.buttons).toEqual([{ id: 'm:cancel', title: 'ביטול שיעור' }])
  })

  it('never costs the parent their booking link when the check itself fails', async () => {
    mockGetWeeklyQuotaStatus.mockRejectedValue(new Error('db down'))

    expect(await notifyIfWeeklyQuotaReached(PARAMS)).toBe(false)
    expect(mockSendReplyButtons).not.toHaveBeenCalled()
  })
})
