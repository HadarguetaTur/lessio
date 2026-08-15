import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSendTextMessage, mockSendTemplateMessage } = vi.hoisted(() => ({
  mockSendTextMessage: vi.fn(),
  mockSendTemplateMessage: vi.fn(),
}))

vi.mock('./index', () => ({
  sendTextMessage: mockSendTextMessage,
  sendTemplateMessage: mockSendTemplateMessage,
}))

import { sendOtp, OTP_TEMPLATE_NAME, OTP_TEMPLATE_LANGUAGE } from './sendOtp'

const PHONE = '+972501234567'
const OTP = '123456'
const TOKEN = 'token-1'
const PHONE_NUMBER_ID = 'pn-1'

describe('sendOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendTemplateMessage.mockResolvedValue(undefined)
    mockSendTextMessage.mockResolvedValue(undefined)
  })

  it('sends the auth template with the code in both body and button parameters', async () => {
    await sendOtp(PHONE, OTP, TOKEN, PHONE_NUMBER_ID)

    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      PHONE,
      TOKEN,
      PHONE_NUMBER_ID,
      OTP_TEMPLATE_NAME,
      OTP_TEMPLATE_LANGUAGE,
      [
        { type: 'body', parameters: [{ type: 'text', text: OTP }] },
        { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: OTP }] },
      ]
    )
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('falls back to a text message containing the code when the template send fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSendTemplateMessage.mockRejectedValue(new Error('template not approved (132001)'))

    await sendOtp(PHONE, OTP, TOKEN, PHONE_NUMBER_ID)

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining(OTP),
      TOKEN,
      PHONE_NUMBER_ID
    )
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('throws when both the template and the text fallback fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSendTemplateMessage.mockRejectedValue(new Error('template failed'))
    mockSendTextMessage.mockRejectedValue(new Error('session window closed (131047)'))

    await expect(sendOtp(PHONE, OTP, TOKEN, PHONE_NUMBER_ID)).rejects.toThrow(
      'session window closed'
    )

    warnSpy.mockRestore()
  })
})
