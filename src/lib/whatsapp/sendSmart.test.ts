import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockResolveTemplate,
  mockSendTextMessage,
  mockSendTemplateMessage,
  mockPrepareBusinessSend,
  mockGetApprovedCustomTemplate,
  mockLoadRawTemplate,
  mockSendCtaUrlMessage,
  mockIsTemplateApproved,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockResolveTemplate: vi.fn(),
  mockSendTextMessage: vi.fn(),
  mockSendTemplateMessage: vi.fn(),
  mockPrepareBusinessSend: vi.fn(),
  mockGetApprovedCustomTemplate: vi.fn(),
  mockLoadRawTemplate: vi.fn(),
  mockSendCtaUrlMessage: vi.fn(),
  mockIsTemplateApproved: vi.fn(),
}))

vi.mock('./consent', () => ({
  prepareBusinessSend: mockPrepareBusinessSend,
}))

vi.mock('./templateStatus', () => ({
  getApprovedCustomTemplate: mockGetApprovedCustomTemplate,
  isTemplateApproved: mockIsTemplateApproved,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

// The pure helpers stay real: stripping the URL line is the behaviour under
// test, and a stub of it would pass while the bug shipped. Only the two DB
// readers are mocked.
vi.mock('./templates', async () => {
  const actual = await vi.importActual<typeof import('./templates')>('./templates')
  return {
    ...actual,
    resolveTemplate: mockResolveTemplate,
    loadRawTemplate: mockLoadRawTemplate,
  }
})

vi.mock('./index', () => ({
  sendTextMessage: mockSendTextMessage,
  sendTemplateMessage: mockSendTemplateMessage,
  sendCtaUrlMessage: mockSendCtaUrlMessage,
  CTA_BODY_MAX: 1024,
}))

import { sendSmartMessage, sendPaymentWithButton } from './sendSmart'

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
    mockPrepareBusinessSend.mockResolvedValue({ ok: true })
    mockGetApprovedCustomTemplate.mockResolvedValue(null)
  })

  describe('business-send gate (opt-out + welcome notice)', () => {
    it('sends nothing when the recipient opted out, inside the window', async () => {
      buildQueryMock({ data: { message_id: 'msg-1' }, error: null })
      mockPrepareBusinessSend.mockResolvedValue({ ok: false, reason: 'opted_out' })

      const result = await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(result).toEqual({ sent: false, reason: 'opted_out' })
      expect(mockSendTextMessage).not.toHaveBeenCalled()
      expect(mockSendTemplateMessage).not.toHaveBeenCalled()
    })

    it('sends nothing when the recipient opted out, outside the window', async () => {
      buildQueryMock({ data: null, error: null })
      mockPrepareBusinessSend.mockResolvedValue({ ok: false, reason: 'opted_out' })

      const result = await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(result).toEqual({ sent: false, reason: 'opted_out' })
      expect(mockSendTemplateMessage).not.toHaveBeenCalled()
    })

    it('runs the gate before spending a session-window query, with the send credentials', async () => {
      const query = buildQueryMock({ data: null, error: null })
      mockPrepareBusinessSend.mockResolvedValue({ ok: false, reason: 'opted_out' })

      await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder', locale: 'en' })

      expect(mockPrepareBusinessSend).toHaveBeenCalledWith({
        orgId: 'org-1',
        phone: '+972501234567',
        accessToken: 'token-1',
        phoneNumberId: 'pn-1',
        locale: 'en',
      })
      expect(query.maybeSingle).not.toHaveBeenCalled()
    })

    // The gate sends the welcome notice itself; the business message must
    // follow it, never precede it.
    it('sends the business message only after the gate resolved', async () => {
      buildQueryMock({ data: { message_id: 'msg-1' }, error: null })
      const order: string[] = []
      mockPrepareBusinessSend.mockImplementation(async () => {
        order.push('gate')
        return { ok: true }
      })
      mockSendTextMessage.mockImplementation(async () => {
        order.push('send')
      })

      await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(order).toEqual(['gate', 'send'])
    })

    it('reports a successful send so callers can tell the two apart', async () => {
      buildQueryMock({ data: { message_id: 'msg-1' }, error: null })

      const result = await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(result).toEqual({ sent: true })
    })
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

    expect(mockResolveTemplate).toHaveBeenCalledWith('org-1', 'lesson_reminder', BASE_PARAMS.vars, 'he')
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
      'lessio_lesson_reminder_he_v2',
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

  describe('org-authored approved templates', () => {
    it('prefers the org\'s own approved template over the built-in one', async () => {
      buildQueryMock({ data: null, error: null })
      mockGetApprovedCustomTemplate.mockResolvedValue({
        name: 'lessio_lesson_reminder_he_c1',
        language: 'he',
        varOrder: ['date', 'teacher_name'],
      })

      await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(mockGetApprovedCustomTemplate).toHaveBeenCalledWith('org-1', 'lesson_reminder', 'he')
      expect(mockSendTemplateMessage).toHaveBeenCalledWith(
        '+972501234567',
        'token-1',
        'pn-1',
        'lessio_lesson_reminder_he_c1',
        'he',
        // Parameters follow the org's own variable order, not the built-in one.
        [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: '12/5' },
              { type: 'text', text: 'שרה' },
            ],
          },
        ]
      )
      expect(mockSendTextMessage).not.toHaveBeenCalled()
    })

    it('substitutes a non-empty placeholder for a variable that resolved to nothing', async () => {
      buildQueryMock({ data: null, error: null })
      mockGetApprovedCustomTemplate.mockResolvedValue({
        name: 'lessio_lesson_reminder_en_c2',
        language: 'en',
        varOrder: ['teacher_name'],
      })

      await sendSmartMessage({
        ...BASE_PARAMS,
        vars: { teacher_name: '' },
        locale: 'en',
        templateType: 'lesson_reminder',
      })

      expect(mockSendTemplateMessage).toHaveBeenCalledWith(
        '+972501234567',
        'token-1',
        'pn-1',
        'lessio_lesson_reminder_en_c2',
        'en',
        [{ type: 'body', parameters: [{ type: 'text', text: 'your teacher' }] }]
      )
    })

    it('uses the built-in template when the org has no approved one', async () => {
      buildQueryMock({ data: null, error: null })
      mockGetApprovedCustomTemplate.mockResolvedValue(null)

      await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(mockSendTemplateMessage).toHaveBeenCalledWith(
        '+972501234567',
        'token-1',
        'pn-1',
        'lessio_lesson_reminder_he_v2',
        'he',
        expect.any(Array)
      )
    })

    it('is not consulted while the 24h window is open', async () => {
      buildQueryMock({ data: { message_id: 'msg-1' }, error: null })

      await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

      expect(mockGetApprovedCustomTemplate).not.toHaveBeenCalled()
      expect(mockSendTextMessage).toHaveBeenCalled()
    })
  })

  it('assumes the window is closed when the session query errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    buildQueryMock({ data: null, error: { message: 'column does not exist' } })

    await sendSmartMessage({ ...BASE_PARAMS, templateType: 'lesson_reminder' })

    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      '+972501234567',
      'token-1',
      'pn-1',
      'lessio_lesson_reminder_he_v2',
      'he',
      expect.any(Array)
    )
    expect(mockSendTextMessage).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})

// ── sendPaymentWithButton ────────────────────────────────────────────────────

describe('sendPaymentWithButton', () => {
  const PAY_PARAMS = {
    orgId: 'org-1',
    phone: '+972501234567',
    accessToken: 'token-1',
    phoneNumberId: 'pn-1',
    templateType: 'payment_request' as const,
    vars: {
      parent_name: 'מיכל',
      amount: '₪250.00',
      amount_value: '250.00',
      description: '2 חיובים פתוחים',
      charge_lines: '',
      payment_link: 'https://pay.example.com/abc',
    },
    chargeId: 'charge-1',
    paymentUrl: 'https://pay.example.com/abc',
    locale: 'he' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepareBusinessSend.mockResolvedValue({ ok: true })
    mockGetApprovedCustomTemplate.mockResolvedValue(null)
    mockIsTemplateApproved.mockResolvedValue(false)
    mockResolveTemplate.mockResolvedValue('resolved fallback body')
    mockSendCtaUrlMessage.mockResolvedValue(undefined)
    mockSendTextMessage.mockResolvedValue(undefined)
    mockSendTemplateMessage.mockResolvedValue(undefined)
  })

  /** One row in the last 24h = the window is open. */
  function windowOpen() {
    buildQueryMock({ data: { message_id: 'wamid.1' }, error: null })
  }

  it('sends the link ONCE — as the button, not also in the body', async () => {
    // The regression this whole change exists for: resolveTemplate substitutes
    // the URL, so stripping afterwards looked for a {{payment_link}} that was
    // already gone. The link stayed in the text AND a button was attached.
    windowOpen()
    mockLoadRawTemplate.mockResolvedValue(
      'היי {{parent_name}} 👋\nבקשת תשלום על סך {{amount}} עבור {{description}}.{{charge_lines}}\nהתשלום מאובטח ולוקח פחות מדקה.\n{{payment_link}}\nתודה 🙏'
    )

    await sendPaymentWithButton(PAY_PARAMS)

    expect(mockSendCtaUrlMessage).toHaveBeenCalledTimes(1)
    const [, body, buttonLabel, url] = mockSendCtaUrlMessage.mock.calls[0]
    expect(body).not.toContain(PAY_PARAMS.paymentUrl)
    expect(body).toContain('₪250.00')
    expect(body).toContain('2 חיובים פתוחים')
    expect(buttonLabel).toBe('לתשלום מאובטח')
    expect(url).toBe(PAY_PARAMS.paymentUrl)
    expect(mockSendTextMessage).not.toHaveBeenCalled()
  })

  it('leaves no orphan label where the link line used to be', async () => {
    windowOpen()
    mockLoadRawTemplate.mockResolvedValue(
      'בקשת תשלום על סך {{amount}}.\nהתשלום מאובטח ולוקח פחות מדקה.\n{{payment_link}}\nתודה 🙏'
    )

    await sendPaymentWithButton(PAY_PARAMS)

    const body = mockSendCtaUrlMessage.mock.calls[0][1] as string
    const lastLine = body.split('\n').filter((l) => l.trim()).pop()!
    expect(lastLine.endsWith(':')).toBe(false)
  })

  it('substitutes an omitted optional variable rather than leaking braces', async () => {
    windowOpen()
    mockLoadRawTemplate.mockResolvedValue('סכום {{amount}}.{{charge_lines}}\n{{payment_link}}')

    await sendPaymentWithButton({
      ...PAY_PARAMS,
      vars: { amount: '₪250.00', payment_link: PAY_PARAMS.paymentUrl },
    })

    expect(mockSendCtaUrlMessage.mock.calls[0][1]).not.toContain('{{')
  })

  it('keeps the text form and drops the button when the org wrote the link mid-sentence', async () => {
    // stripStandaloneVarLine returns null there; attaching a button anyway
    // would send the link twice, which is what the old code did.
    windowOpen()
    mockLoadRawTemplate.mockResolvedValue('הקישור לתשלום הוא {{payment_link}} — תודה')

    await sendPaymentWithButton(PAY_PARAMS)

    expect(mockSendCtaUrlMessage).not.toHaveBeenCalled()
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      '+972501234567',
      'resolved fallback body',
      'token-1',
      'pn-1'
    )
  })

  it('outside the window sends the v3 template with the charge id as the button suffix', async () => {
    buildQueryMock({ data: null, error: null })
    mockLoadRawTemplate.mockResolvedValue('unused out of window')

    await sendPaymentWithButton(PAY_PARAMS)

    expect(mockSendCtaUrlMessage).not.toHaveBeenCalled()
    const [, , , name, , components] = mockSendTemplateMessage.mock.calls[0]
    expect(name).toBe('lessio_payment_request_he_v3')
    const button = (components as Array<Record<string, unknown>>).find((c) => c.type === 'button')
    expect(button).toMatchObject({ sub_type: 'url', index: 0 })
    expect((button!.parameters as Array<{ text: string }>)[0].text).toBe('charge-1')
  })

  it('gives the Meta template the bare figure, not the formatted money', async () => {
    // The approved v2/v3 bodies print '₪' themselves, so a formatted parameter
    // would render '₪₪250.00' to the parent.
    buildQueryMock({ data: null, error: null })
    mockLoadRawTemplate.mockResolvedValue('unused')

    await sendPaymentWithButton(PAY_PARAMS)

    const components = mockSendTemplateMessage.mock.calls[0][5] as Array<Record<string, unknown>>
    const bodyParams = (components.find((c) => c.type === 'body')!
      .parameters as Array<{ text: string }>)
    expect(bodyParams[0].text).toBe('250.00')
  })

  it('does not send at all when the parent opted out', async () => {
    mockPrepareBusinessSend.mockResolvedValue({ ok: false, reason: 'opted_out' })

    const result = await sendPaymentWithButton(PAY_PARAMS)

    expect(result).toEqual({ sent: false, reason: 'opted_out' })
    expect(mockSendCtaUrlMessage).not.toHaveBeenCalled()
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })
})

describe('the v4 templates (no hardcoded currency symbol)', () => {
  const PAY_PARAMS = {
    orgId: 'org-1',
    phone: '+972501234567',
    accessToken: 'token-1',
    phoneNumberId: 'pn-1',
    templateType: 'payment_request' as const,
    vars: { amount: '₪250.00', amount_value: '250.00', payment_link: 'https://pay.example.com/abc' },
    chargeId: 'charge-1',
    paymentUrl: 'https://pay.example.com/abc',
    locale: 'he' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepareBusinessSend.mockResolvedValue({ ok: true })
    mockGetApprovedCustomTemplate.mockResolvedValue(null)
    mockResolveTemplate.mockResolvedValue('fallback')
    mockLoadRawTemplate.mockResolvedValue('unused out of window')
    mockSendTemplateMessage.mockResolvedValue(undefined)
    // Outside the 24h window.
    buildQueryMock({ data: null, error: null })
  })

  it('stays on v3 with the bare figure while v4 is unapproved — the state today', async () => {
    mockIsTemplateApproved.mockResolvedValue(false)

    await sendPaymentWithButton(PAY_PARAMS)

    const [, , , name, , components] = mockSendTemplateMessage.mock.calls[0]
    expect(name).toBe('lessio_payment_request_he_v3')
    const bodyParams = (components as Array<Record<string, unknown>>).find((c) => c.type === 'body')!
      .parameters as Array<{ text: string }>
    expect(bodyParams[0].text).toBe('250.00')
  })

  it('switches to v4 with the formatted amount once Meta approves it', async () => {
    mockIsTemplateApproved.mockResolvedValue(true)

    await sendPaymentWithButton(PAY_PARAMS)

    expect(mockIsTemplateApproved).toHaveBeenCalledWith('org-1', 'lessio_payment_request_he_v4', 'he')
    const [, , , name, , components] = mockSendTemplateMessage.mock.calls[0]
    expect(name).toBe('lessio_payment_request_he_v4')
    const bodyParams = (components as Array<Record<string, unknown>>).find((c) => c.type === 'body')!
      .parameters as Array<{ text: string }>
    // v4's copy prints no symbol, so the parameter carries it — the pairing
    // that must never come apart.
    expect(bodyParams[0].text).toBe('₪250.00')
  })

  it('keeps the URL button on v4', async () => {
    mockIsTemplateApproved.mockResolvedValue(true)

    await sendPaymentWithButton(PAY_PARAMS)

    const components = mockSendTemplateMessage.mock.calls[0][5] as Array<Record<string, unknown>>
    const button = components.find((c) => c.type === 'button')
    expect(button).toMatchObject({ sub_type: 'url', index: 0 })
    expect((button!.parameters as Array<{ text: string }>)[0].text).toBe('charge-1')
  })

  it('payment_reminder keeps parent_name first in both versions', async () => {
    for (const approved of [false, true]) {
      vi.clearAllMocks()
      buildQueryMock({ data: null, error: null })
      mockPrepareBusinessSend.mockResolvedValue({ ok: true })
      mockGetApprovedCustomTemplate.mockResolvedValue(null)
      mockLoadRawTemplate.mockResolvedValue('unused')
      mockSendTemplateMessage.mockResolvedValue(undefined)
      mockIsTemplateApproved.mockResolvedValue(approved)

      await sendPaymentWithButton({
        ...PAY_PARAMS,
        templateType: 'payment_reminder',
        vars: { ...PAY_PARAMS.vars, parent_name: 'מיכל' },
      })

      const components = mockSendTemplateMessage.mock.calls[0][5] as Array<Record<string, unknown>>
      const bodyParams = (components.find((c) => c.type === 'body')!
        .parameters as Array<{ text: string }>)
      expect(bodyParams[0].text, `approved=${approved}`).toBe('מיכל')
      expect(bodyParams[1].text, `approved=${approved}`).toBe(approved ? '₪250.00' : '250.00')
    }
  })
})
