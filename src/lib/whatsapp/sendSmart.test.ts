import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockResolveTemplate,
  mockSendTextMessage,
  mockSendTemplateMessage,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockResolveTemplate: vi.fn(),
  mockSendTextMessage: vi.fn(),
  mockSendTemplateMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('./templates', () => ({
  resolveTemplate: mockResolveTemplate,
}))

vi.mock('./index', () => ({
  sendTextMessage: mockSendTextMessage,
  sendTemplateMessage: mockSendTemplateMessage,
}))

import { sendSmartMessage } from './sendSmart'

const BASE_PARAMS = {
  orgId: 'org-1',
  phone: '+972501234567',
  accessToken: 'token-1',
  phoneNumberId: 'pn-1',
  vars: { teacher_name: 'שרה', date: '12/5', time: '16:00' },
}

function buildQueryMock(result: { data: unknown; error: { message: string } | null }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn(() => query),
  })
  return query
}

describe('sendSmartMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTemplate.mockResolvedValue('resolved body')
    mockSendTextMessage.mockResolvedValue(undefined)
    mockSendTemplateMessage.mockResolvedValue(undefined)
  })

  it('queries the session window on the real columns (phone / message_id)', async () => {
    const query = buildQueryMock({ data: { message_id: 'msg-1' }, error: null })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

    expect(query.select).toHaveBeenCalledWith('message_id')
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(query.eq).toHaveBeenCalledWith('phone', '+972501234567')
    expect(query.eq).not.toHaveBeenCalledWith('from_phone', expect.anything())
  })

  it('sends a resolved text message when the 24h window is open', async () => {
    buildQueryMock({ data: { message_id: 'msg-1' }, error: null })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

    expect(mockResolveTemplate).toHaveBeenCalledWith('org-1', 'lesson_reminder', BASE_PARAMS.vars)
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      '+972501234567',
      'resolved body',
      'token-1',
      'pn-1'
    )
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  it('sends the Meta-approved template when the window is closed', async () => {
    buildQueryMock({ data: null, error: null })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      '+972501234567',
      'token-1',
      'pn-1',
      'lessio_lesson_reminder_he',
      'he',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'שרה' },
            { type: 'text', text: '12/5' },
            { type: 'text', text: '16:00' },
          ],
        },
      ]
    )
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('falls back to text when no approved template exists for the type', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildQueryMock({ data: null, error: null })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'balance_reply' })

    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      '+972501234567',
      'resolved body',
      'token-1',
      'pn-1'
    )
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('assumes the window is closed when the session query errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildQueryMock({ data: null, error: { message: 'column does not exist' } })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      '+972501234567',
      'token-1',
      'pn-1',
      'lessio_lesson_reminder_he',
      'he',
      expect.any(Array)
    )
    expect(mockSendTextMessage).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
