/**
 * A dead WhatsApp token stops the business. It has to reach the dashboard.
 *
 * Before this, an outbound 401 was a per-caller console.error: reminders,
 * payment requests and bot replies all stopped, and the settings page went on
 * showing a green check because nothing wrote the failure down.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockRecordHealthError,
  mockHasRecent,
  mockNotifyMultiple,
  mockOwnerIds,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockRecordHealthError: vi.fn(),
  mockHasRecent: vi.fn(),
  mockNotifyMultiple: vi.fn(),
  mockOwnerIds: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/notifications', () => ({
  getOwnerAndAdminProfileIds: mockOwnerIds,
  hasRecentUnreadOrgNotification: mockHasRecent,
  notifyMultiple: mockNotifyMultiple,
}))

vi.mock('./health', async () => ({
  ...(await vi.importActual<typeof import('./health')>('./health')),
  recordHealthError: mockRecordHealthError,
}))

import { reportSendFailure } from './sendFailure'

const OAUTH_BODY = JSON.stringify({
  error: { message: 'Error validating access token', code: 190, type: 'OAuthException' },
})

function orgDb() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { default_locale: 'he' } }),
        })),
      })),
    })),
  }
}

describe('reportSendFailure()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateServiceRoleClient.mockReturnValue(orgDb())
    mockHasRecent.mockResolvedValue(false)
    mockOwnerIds.mockResolvedValue(['profile-1', 'profile-2'])
    mockRecordHealthError.mockResolvedValue(undefined)
    mockNotifyMultiple.mockResolvedValue(undefined)
  })

  it('records the dead token and alerts every owner and admin', async () => {
    await reportSendFailure(401, OAUTH_BODY, 'org-1')

    expect(mockRecordHealthError).toHaveBeenCalledWith('org-1', 'token_invalid')
    expect(mockNotifyMultiple).toHaveBeenCalledWith(
      'org-1',
      ['profile-1', 'profile-2'],
      'whatsapp_health',
      expect.any(String),
      expect.any(String),
      '/settings/whatsapp'
    )
  })

  it('says nothing twice in a day — one dead token fails every queued send', async () => {
    mockHasRecent.mockResolvedValue(true)

    await reportSendFailure(401, OAUTH_BODY, 'org-1')

    expect(mockRecordHealthError).toHaveBeenCalled()
    expect(mockNotifyMultiple).not.toHaveBeenCalled()
  })

  it('ignores failures that are not about credentials', async () => {
    // A rate limit or a malformed body is the caller's problem, not a broken
    // connection, and must never paint the connection as reconnect-required.
    await reportSendFailure(429, JSON.stringify({ error: { code: 131048 } }), 'org-1')
    await reportSendFailure(500, 'gateway error', 'org-1')

    expect(mockRecordHealthError).not.toHaveBeenCalled()
    expect(mockNotifyMultiple).not.toHaveBeenCalled()
  })

  it('never throws — it is a side note on a send that is already failing', async () => {
    mockRecordHealthError.mockRejectedValue(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(reportSendFailure(401, OAUTH_BODY, 'org-1')).resolves.toBeUndefined()

    warn.mockRestore()
  })
})
