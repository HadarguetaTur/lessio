import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockRequireMutation,
  mockRequireFeature,
  mockCreateServiceRoleClient,
  mockDecryptToken,
  mockSendSmartMessage,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockRequireFeature: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockSendSmartMessage: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/saas/featureGate', () => ({ requireFeature: mockRequireFeature }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({ decryptToken: mockDecryptToken }))

vi.mock('@/lib/whatsapp/sendSmart', () => ({ sendSmartMessage: mockSendSmartMessage }))

// Translations are resolved to their key so assertions read as the key itself.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: async (k: string) => `common.errors.${k}`,
  zodError: async (issue?: { message: string }) => issue?.message ?? 'invalidData',
}))

import { sendTestTemplateAction, type SendTestResult } from './actions'

const OWNER = { orgId: 'org-1', role: 'owner', isSupportMode: false }
const IDLE: SendTestResult = { error: null }

/** Minimal stand-in for the supabase builder chain this action uses. */
function orgReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row }) }),
      }),
    }),
  }
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const CONNECTED = {
  whatsapp_phone_number_id: '15550001111',
  whatsapp_access_token: 'cipher',
}

const VALID = {
  templateType: 'lesson_reminder',
  locale: 'he',
  phone: '+972501234567',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSession.mockResolvedValue(OWNER)
  mockCreateServiceRoleClient.mockReturnValue(orgReturning(CONNECTED))
  mockDecryptToken.mockReturnValue('plain-token')
  mockSendSmartMessage.mockResolvedValue({ sent: true })
})

describe('sendTestTemplateAction', () => {
  it('refuses a non-owner before touching WhatsApp', async () => {
    mockGetSession.mockResolvedValue({ ...OWNER, role: 'admin' })
    const result = await sendTestTemplateAction(IDLE, form(VALID))
    expect(result.error).toBe('common.errors.noPermission')
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('blocks writes while a superadmin is in support mode', async () => {
    mockRequireMutation.mockImplementation(() => {
      throw new Error('read-only')
    })
    await expect(sendTestTemplateAction(IDLE, form(VALID))).rejects.toThrow('read-only')
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('rejects a phone number that is not in international format', async () => {
    for (const phone of ['0501234567', '972501234567', '+972', 'not a phone', '']) {
      mockSendSmartMessage.mockClear()
      const result = await sendTestTemplateAction(IDLE, form({ ...VALID, phone }))
      expect(result.error, phone).toBe('validation.invalidPhone')
      expect(mockSendSmartMessage, phone).not.toHaveBeenCalled()
    }
  })

  it('accepts a number typed with spaces or dashes', async () => {
    const result = await sendTestTemplateAction(IDLE, form({ ...VALID, phone: '+972 50-123 4567' }))
    expect(result.error).toBeNull()
    expect(mockSendSmartMessage).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+972501234567' })
    )
  })

  it('rejects an unknown locale', async () => {
    const result = await sendTestTemplateAction(IDLE, form({ ...VALID, locale: 'fr' }))
    expect(result.error).not.toBeNull()
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('rejects an unknown template type', async () => {
    const result = await sendTestTemplateAction(
      IDLE,
      form({ ...VALID, templateType: 'no_such_template' })
    )
    expect(result.error).toBe('settings.messageTemplates.test.unknownType')
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('asks the owner to connect a number before sending anything', async () => {
    mockCreateServiceRoleClient.mockReturnValue(orgReturning({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
    }))
    const result = await sendTestTemplateAction(IDLE, form(VALID))
    expect(result.error).toBe('settings.messageTemplates.test.connectFirst')
    expect(result.notConnected).toBe(true)
    expect(mockSendSmartMessage).not.toHaveBeenCalled()
  })

  it('sends through sendSmartMessage with the preview values', async () => {
    const result = await sendTestTemplateAction(IDLE, form(VALID))
    expect(result).toEqual({ error: null, success: true })
    expect(mockSendSmartMessage).toHaveBeenCalledTimes(1)
    const args = mockSendSmartMessage.mock.calls[0][0]
    expect(args.orgId).toBe('org-1')
    expect(args.templateType).toBe('lesson_reminder')
    expect(args.locale).toBe('he')
    expect(args.phoneNumberId).toBe('15550001111')
    expect(args.accessToken).toBe('plain-token')
    expect(Object.keys(args.vars).length).toBeGreaterThan(0)
  })

  it('reports a skipped send rather than claiming success', async () => {
    mockSendSmartMessage.mockResolvedValue({ sent: false, reason: 'opted_out' })
    const result = await sendTestTemplateAction(IDLE, form(VALID))
    expect(result.error).toBe('settings.messageTemplates.test.sendFailed')
    expect(result.success).toBeUndefined()
  })

  it('does not leak the underlying error when the send throws', async () => {
    mockSendSmartMessage.mockRejectedValue(new Error('meta 131047 for org 8f3a-...'))
    const result = await sendTestTemplateAction(IDLE, form(VALID))
    expect(result.error).toBe('settings.messageTemplates.test.sendFailed')
    expect(result.error).not.toContain('131047')
  })

  it('throttles at five sends an hour for one org', async () => {
    // Fresh org id: the counter is module-level and shared across tests.
    const fd = form({ ...VALID })
    mockGetSession.mockResolvedValue({ ...OWNER, orgId: 'org-throttle' })
    for (let i = 0; i < 5; i++) {
      expect((await sendTestTemplateAction(IDLE, fd)).error, `send ${i + 1}`).toBeNull()
    }
    const sixth = await sendTestTemplateAction(IDLE, fd)
    expect(sixth.error).toBe('settings.messageTemplates.test.rateLimited')
    expect(mockSendSmartMessage).toHaveBeenCalledTimes(5)
  })
})

describe('the test message uses the sample values of the language being tested', () => {
  // A different org: the rate-limit suite above deliberately exhausts org-1's
  // hourly budget, and the limiter's state is module-level.
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ ...OWNER, orgId: 'org-locale' })
  })

  // The preview table used to be shared across languages, so an owner testing
  // the English copy really received English wording wrapped around 'אהרון כהן'.
  it('English test send carries English samples', async () => {
    const result = await sendTestTemplateAction(
      IDLE,
      form({ ...VALID, locale: 'en', templateType: 'lesson_reminder' })
    )

    expect(result.error).toBeNull()
    const { vars, locale } = mockSendSmartMessage.mock.calls[0][0]
    expect(locale).toBe('en')
    expect(vars.teacher_name).toBe('Aaron Cohen')
    for (const value of Object.values(vars as Record<string, string>)) {
      expect(value).not.toMatch(/[\u0590-\u05FF]/)
    }
  })

  it('Hebrew test send still carries Hebrew samples', async () => {
    await sendTestTemplateAction(IDLE, form({ ...VALID, templateType: 'lesson_reminder' }))

    const { vars } = mockSendSmartMessage.mock.calls[0][0]
    expect(vars.teacher_name).toBe('אהרון כהן')
  })
})
