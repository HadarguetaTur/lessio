import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Resend SDK reports an API rejection in its result and never throws, so
// a send that "did not throw" says nothing about whether the email went out.
const send = vi.fn()
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/lib/gmail', () => ({ sendViaGmail: vi.fn() }))

async function load() {
  vi.resetModules()
  process.env.RESEND_API_KEY = 're_test'
  return import('./index')
}

describe('sendPlatformEmail', () => {
  beforeEach(() => { send.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'info').mockImplementation(() => {}) })

  it('returns the provider id when the email is accepted', async () => {
    send.mockResolvedValue({ data: { id: 're_123' }, error: null })
    const { sendPlatformEmail } = await load()
    await expect(sendPlatformEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' })).resolves.toEqual({ ok: true, id: 're_123' })
  })

  it('reports a rejection the SDK returned instead of throwing', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'domain not verified' } })
    const { sendPlatformEmail } = await load()
    await expect(sendPlatformEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' }))
      .resolves.toEqual({ ok: false, error: 'validation_error: domain not verified' })
  })

  it('reports a thrown transport error without throwing itself', async () => {
    send.mockRejectedValue(new Error('socket hang up'))
    const { sendPlatformEmail } = await load()
    await expect(sendPlatformEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' }))
      .resolves.toEqual({ ok: false, error: 'socket hang up' })
  })

  it('is a failure, not a success, when no provider is configured', async () => {
    vi.resetModules()
    delete process.env.RESEND_API_KEY
    const { sendPlatformEmail } = await import('./index')
    await expect(sendPlatformEmail({ to: 'a@b.test', subject: 's', html: '<p>x</p>' })).resolves.toEqual({ ok: false, error: 'not configured' })
    expect(send).not.toHaveBeenCalled()
  })
})
