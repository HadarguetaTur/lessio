import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stripStandaloneVarLine, DEFAULT_TEMPLATES } from './templates'

const sendCtaUrlMessage = vi.fn()
const sendTextMessage = vi.fn()
const resolveTemplate = vi.fn()

vi.mock('./index', () => ({
  sendCtaUrlMessage: (...args: unknown[]) => sendCtaUrlMessage(...args),
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
  CTA_BODY_MAX: 1024,
}))

let customTemplate: string | null = null

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({
                data: customTemplate ? [{ body_template: customTemplate, locale: 'he' }] : [],
              }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('./templates', async () => {
  const actual = await vi.importActual<typeof import('./templates')>('./templates')
  return {
    ...actual,
    resolveTemplate: (...args: unknown[]) => resolveTemplate(...args),
  }
})

const { sendLinkReply } = await import('./sendLinkReply')

const BASE = {
  orgId: 'org-1',
  to: '972501234567',
  templateType: 'booking_link' as const,
  urlVar: 'booking_url',
  url: 'https://www.getlessio.com/book/eyJhbGciOi.veryLongToken.signature',
  buttonKey: 'cta_book_lesson' as const,
  locale: 'he' as const,
  accessToken: 'token',
  phoneNumberId: 'pn-1',
}

describe('stripStandaloneVarLine', () => {
  it('lifts the URL line out of the default Hebrew booking template', () => {
    expect(stripStandaloneVarLine(DEFAULT_TEMPLATES.he.booking_link, 'booking_url')).toBe(
      'הנה הקישור לקביעת שיעור 👇\n\nשימו לב: הקישור בתוקף ל-15 דקות.'
    )
  })

  it('lifts the URL line out of the default English portal template', () => {
    expect(stripStandaloneVarLine(DEFAULT_TEMPLATES.en.portal_link_reply, 'portal_url')).toBe(
      'Here is your personal area:\n\nSign in with your phone number, no password needed 😊'
    )
  })

  it('returns null when the placeholder sits mid-sentence', () => {
    expect(stripStandaloneVarLine('הקישור הוא {{booking_url}} בבקשה', 'booking_url')).toBeNull()
  })

  it('returns null when the placeholder is missing', () => {
    expect(stripStandaloneVarLine('no link here', 'booking_url')).toBeNull()
  })

  it('returns null when the placeholder appears twice', () => {
    expect(stripStandaloneVarLine('{{booking_url}}\nagain:\n{{booking_url}}', 'booking_url')).toBeNull()
  })
})

describe('sendLinkReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customTemplate = null
    sendCtaUrlMessage.mockResolvedValue(undefined)
    sendTextMessage.mockResolvedValue(undefined)
    resolveTemplate.mockResolvedValue('text fallback body')
  })

  it('sends a CTA button with the URL hidden from the body', async () => {
    await sendLinkReply(BASE)

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(sendCtaUrlMessage).toHaveBeenCalledTimes(1)
    const [to, body, buttonText, url] = sendCtaUrlMessage.mock.calls[0]
    expect(to).toBe(BASE.to)
    expect(body).not.toContain(BASE.url)
    expect(body).toContain('הנה הקישור לקביעת שיעור')
    expect(buttonText).toBe('לקביעת שיעור')
    expect(url).toBe(BASE.url)
  })

  it('uses the English button label for an English recipient', async () => {
    await sendLinkReply({ ...BASE, locale: 'en' })

    expect(sendCtaUrlMessage.mock.calls[0][2]).toBe('Book a lesson')
  })

  it('keeps every button label within Meta 20-char cap', () => {
    expect('לקביעת שיעור'.length).toBeLessThanOrEqual(20)
    expect('Book a lesson'.length).toBeLessThanOrEqual(20)
    expect('לאזור האישי'.length).toBeLessThanOrEqual(20)
    expect('My personal area'.length).toBeLessThanOrEqual(20)
  })

  it('falls back to plain text when the org embedded the URL mid-sentence', async () => {
    customTemplate = 'הקישור שלך הוא {{booking_url}} — בתוקף ל-15 דקות'

    await sendLinkReply(BASE)

    expect(sendCtaUrlMessage).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledWith(
      BASE.to,
      'text fallback body',
      BASE.accessToken,
      BASE.phoneNumberId
    )
  })

  it('falls back to plain text when Meta rejects the interactive send', async () => {
    sendCtaUrlMessage.mockRejectedValue(new Error('WhatsApp CTA URL API error 400'))

    await sendLinkReply(BASE)

    expect(sendCtaUrlMessage).toHaveBeenCalledTimes(1)
    expect(sendTextMessage).toHaveBeenCalledWith(
      BASE.to,
      'text fallback body',
      BASE.accessToken,
      BASE.phoneNumberId
    )
  })

  it('falls back to plain text when the body exceeds the interactive limit', async () => {
    customTemplate = `${'x'.repeat(1100)}\n{{booking_url}}`

    await sendLinkReply(BASE)

    expect(sendCtaUrlMessage).not.toHaveBeenCalled()
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
  })

  it('substitutes non-URL variables into the CTA body', async () => {
    customTemplate = 'היי {{student_name}}, לקביעת שיעור:\n{{booking_url}}'

    await sendLinkReply({ ...BASE, vars: { student_name: 'דנה' } })

    expect(sendCtaUrlMessage.mock.calls[0][1]).toBe('היי דנה, לקביעת שיעור:')
  })
})
