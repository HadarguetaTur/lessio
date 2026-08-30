/**
 * loadRawTemplate is the single reader both resolveTemplate and the CTA senders
 * go through. Two things must hold: exact-language-only (sendLinkReply's private
 * copy used to fall back to the org's Hebrew row and wrap English content in a
 * Hebrew body), and never throwing — a template read failing must degrade to the
 * default, not drop a parent's reminder.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { loadRawTemplate, resolveTemplate, DEFAULT_TEMPLATES } from './templates'

/** Records the locale the query filtered on, and answers with `row`. */
function mockDb(rowFor: Record<string, string | undefined>) {
  const seen: string[] = []
  mockCreateServiceRoleClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: (_col: string, locale: string) => {
              seen.push(locale)
              return {
                maybeSingle: () =>
                  Promise.resolve({
                    data: rowFor[locale] ? { body_template: rowFor[locale] } : null,
                    error: null,
                  }),
              }
            },
          }),
        }),
      }),
    }),
  })
  return seen
}

describe('loadRawTemplate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the org row for the requested language, unsubstituted', async () => {
    mockDb({ he: 'שלום {{parent_name}}' })
    expect(await loadRawTemplate('org-1', 'payment_request', 'he')).toBe('שלום {{parent_name}}')
  })

  it('does NOT fall back to the Hebrew row for an English recipient', async () => {
    const seen = mockDb({ he: 'הנוסח העברי המותאם' })

    const body = await loadRawTemplate('org-1', 'payment_request', 'en')

    expect(seen).toEqual(['en'])
    expect(body).toBe(DEFAULT_TEMPLATES.en.payment_request)
    expect(body).not.toContain('הנוסח העברי המותאם')
  })

  it('falls back to the built-in default when the org has no row', async () => {
    mockDb({})
    expect(await loadRawTemplate('org-1', 'lesson_reminder', 'en')).toBe(
      DEFAULT_TEMPLATES.en.lesson_reminder
    )
  })

  it('returns the default rather than throwing when the DB is unreachable', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('connection refused')
    })

    expect(await loadRawTemplate('org-1', 'lesson_reminder', 'he')).toBe(
      DEFAULT_TEMPLATES.he.lesson_reminder
    )
    errSpy.mockRestore()
  })
})

describe('resolveTemplate stays a thin wrapper over it', () => {
  beforeEach(() => vi.clearAllMocks())

  it('substitutes what loadRawTemplate returned', async () => {
    mockDb({ he: 'שלום {{parent_name}}, {{amount}}' })

    expect(
      await resolveTemplate('org-1', 'payment_request', { parent_name: 'מיכל', amount: '₪250.00' }, 'he')
    ).toBe('שלום מיכל, ₪250.00')
  })

  it('fills a declared variable the caller omitted with empty text', async () => {
    // autoSend passed no `description` at all, so a fallback send rendered the
    // literal '{{description}}' to a parent.
    mockDb({ he: 'סכום {{amount}} עבור {{description}}.{{charge_lines}}' })

    const body = await resolveTemplate('org-1', 'payment_request', { amount: '₪250.00' }, 'he')

    expect(body).not.toContain('{{')
    expect(body).toBe('סכום ₪250.00 עבור .')
  })

  it('leaves an UNDECLARED placeholder visible — a typo must not vanish silently', async () => {
    mockDb({ he: 'סכום {{amuont}}' })

    expect(await resolveTemplate('org-1', 'payment_request', { amount: '₪250.00' }, 'he')).toBe(
      'סכום {{amuont}}'
    )
  })
})
