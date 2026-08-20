import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCreateServiceRoleClient,
  mockIsOptedOut,
  mockSendTemplateMessage,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockIsOptedOut: vi.fn(),
  mockSendTemplateMessage: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('./optOut', () => ({
  isOptedOut: mockIsOptedOut,
}))

vi.mock('./index', () => ({
  sendTemplateMessage: mockSendTemplateMessage,
}))

import { prepareBusinessSend, recordParentConsent } from './consent'

const BASE = {
  orgId: 'org-1',
  phone: '+972501234567',
  accessToken: 'token-1',
  phoneNumberId: 'pn-1',
}

/**
 * The gate touches two tables: `parents` is updated (the welcome claim, the
 * claim release, the consent record) and `organizations` is read for the name
 * that goes into the notice.
 */
function mockDb(
  options: {
    /** Rows returned by the atomic welcome claim. [] = already sent, or another caller won the race. */
    claimed?: Array<{ id: string; preferred_locale?: string | null }>
    claimError?: { message: string } | null
    orgName?: string | null
    orgDefaultLocale?: string | null
  } = {}
) {
  const parentsUpdates: Array<Record<string, unknown>> = []

  const parentsQuery = () => {
    const chain: Record<string, unknown> = {}
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      parentsUpdates.push(payload)
      return chain
    })
    chain.eq = vi.fn(() => chain)
    chain.is = vi.fn(() => chain)
    chain.select = vi.fn(async () => ({
      data: options.claimed ?? [],
      error: options.claimError ?? null,
    }))
    // A terminal update (claim release, consent record) is awaited directly
    // rather than through .select().
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return chain
  }

  const orgsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        name: options.orgName ?? 'Brightpath Tutoring',
        default_locale: options.orgDefaultLocale ?? 'he',
      },
      error: null,
    }),
  }

  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn((table: string) => (table === 'organizations' ? orgsQuery : parentsQuery())),
  })

  return { parentsUpdates }
}

describe('prepareBusinessSend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsOptedOut.mockResolvedValue(false)
    mockSendTemplateMessage.mockResolvedValue(undefined)
  })

  it('refuses the send and sends no welcome when the parent opted out', async () => {
    mockDb({ claimed: [{ id: 'p-1' }] })
    mockIsOptedOut.mockResolvedValue(true)

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: false, reason: 'opted_out' })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  it('sends the welcome notice on first contact, as an approved template', async () => {
    mockDb({ claimed: [{ id: 'p-1', preferred_locale: 'he' }], orgName: 'מרכז הלמידה' })

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: true })
    expect(mockSendTemplateMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      '+972501234567',
      'token-1',
      'pn-1',
      'lessio_welcome_notice_he_v2',
      'he',
      [{ type: 'body', parameters: [{ type: 'text', text: 'מרכז הלמידה' }] }]
    )
  })

  it('sends the English notice to an English-speaking parent', async () => {
    mockDb({ claimed: [{ id: 'p-1', preferred_locale: 'en' }], orgName: 'Brightpath Tutoring' })

    await prepareBusinessSend(BASE)

    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      '+972501234567',
      'token-1',
      'pn-1',
      'lessio_welcome_notice_en_v2',
      'en',
      [{ type: 'body', parameters: [{ type: 'text', text: 'Brightpath Tutoring' }] }]
    )
  })

  // The claim is what makes the notice one-time: an already-stamped row does
  // not match `welcome_sent_at IS NULL`, so the UPDATE returns nothing.
  it('sends nothing when the notice already went out, or a racing send won the claim', async () => {
    mockDb({ claimed: [] })

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: true })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()
  })

  it('stamps welcome_sent_at before sending, so a racing cron cannot double-send', async () => {
    const { parentsUpdates } = mockDb({ claimed: [{ id: 'p-1' }] })

    await prepareBusinessSend(BASE)

    expect(parentsUpdates[0]).toEqual({ welcome_sent_at: expect.any(String) })
  })

  // Most often the template is still PENDING at Meta. Releasing the claim means
  // the next business send retries instead of silently skipping it forever.
  it('releases the claim when the notice fails to send', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { parentsUpdates } = mockDb({ claimed: [{ id: 'p-1' }] })
    mockSendTemplateMessage.mockRejectedValue(new Error('132000 template not found'))

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: true })
    expect(parentsUpdates.at(-1)).toEqual({ welcome_sent_at: null })

    warnSpy.mockRestore()
  })

  it('allows the send when the claim query errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockDb({ claimError: { message: 'connection reset' } })

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: true })
    expect(mockSendTemplateMessage).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  // Fail-open is the whole contract: this gate fronts every reminder in the
  // product, so an unexpected throw must not become a messaging blackout.
  it('allows the send when the DB client throws outright', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockIsOptedOut.mockResolvedValue(false)
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('no service role key')
    })

    expect(await prepareBusinessSend(BASE)).toEqual({ ok: true })

    warnSpy.mockRestore()
  })
})

describe('recordParentConsent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records the source, the timestamp and who attested it', async () => {
    const { parentsUpdates } = mockDb()

    await recordParentConsent({ parentId: 'p-1', source: 'attested', consentedBy: 'u-1' })

    expect(parentsUpdates[0]).toEqual({
      consent_source: 'attested',
      consented_at: expect.any(String),
      consented_by: 'u-1',
    })
  })

  // A parent who wrote to us first already knows who we are.
  it('marks the welcome notice as unnecessary for an inbound WhatsApp opt-in', async () => {
    const { parentsUpdates } = mockDb()

    await recordParentConsent({ parentId: 'p-1', source: 'whatsapp_reply', markWelcomeSent: true })

    expect(parentsUpdates[0]).toMatchObject({
      consent_source: 'whatsapp_reply',
      consented_by: null,
      welcome_sent_at: expect.any(String),
    })
  })

  it('leaves welcome_sent_at alone for portal and booking consent', async () => {
    const { parentsUpdates } = mockDb()

    await recordParentConsent({ parentId: 'p-1', source: 'portal' })

    expect(parentsUpdates[0]).not.toHaveProperty('welcome_sent_at')
  })

  it('does not throw when the update fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('no service role key')
    })

    await expect(recordParentConsent({ parentId: 'p-1', source: 'portal' })).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })
})
