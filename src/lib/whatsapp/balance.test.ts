import { describe, it, expect } from 'vitest'
import { resolvePaymentLine, sumOpenCharges, type OpenCharge } from './balance'
import { DEFAULT_TEMPLATES, substituteVars } from './templates'
import { botString } from './strings'
import type { AppLocale } from '@/lib/i18n/locale'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'

describe('sumOpenCharges', () => {
  it('sums amounts', () => {
    expect(sumOpenCharges([{ amount: 250, payment_link: null }, { amount: 100.5, payment_link: null }]))
      .toBe(350.5)
  })

  it('handles numeric columns arriving as strings', () => {
    const rows = [{ amount: '250.00' as unknown as number, payment_link: null }]
    expect(sumOpenCharges(rows)).toBe(250)
  })

  it('is zero for no open charges', () => {
    expect(sumOpenCharges([])).toBe(0)
  })
})

describe('resolvePaymentLine', () => {
  it('offers the link directly when a single charge is the whole balance', () => {
    const line = resolvePaymentLine([{ amount: 250, payment_link: 'https://pay.example.com/1' }], 'he')
    expect(line).toContain('https://pay.example.com/1')
  })

  it('sends to the portal when several charges each carry their own link', () => {
    const line = resolvePaymentLine(
      [
        { amount: 250, payment_link: 'https://pay.example.com/1' },
        { amount: 100, payment_link: 'https://pay.example.com/2' },
      ],
      'he'
    )
    expect(line).not.toContain('https://pay.example.com')
    expect(line).toContain('האזור האישי')
  })

  it('sends to the portal when only some of several charges have a link', () => {
    const line = resolvePaymentLine(
      [
        { amount: 250, payment_link: 'https://pay.example.com/1' },
        { amount: 100, payment_link: null },
      ],
      'he'
    )
    expect(line).not.toContain('https://pay.example.com')
  })

  it('falls back to contacting the teacher when no provider is connected', () => {
    const line = resolvePaymentLine([{ amount: 250, payment_link: null }], 'he')
    expect(line).toContain('למורה')
  })

  // The org keeps payments off its portal: there is no page listing the
  // per-charge links, so the reply must not send the parent to it.
  it('does not point at the portal when the org has portal payments switched off', () => {
    const charges = [
      { amount: 250, payment_link: 'https://pay.example.com/1' },
      { amount: 100, payment_link: 'https://pay.example.com/2' },
    ]
    const line = resolvePaymentLine(charges, 'he', false)
    expect(line).not.toContain('האזור האישי')
    expect(line).toContain('למורה')
    // A single charge still gets its own link — that needs no portal page.
    expect(resolvePaymentLine([charges[0]], 'he', false)).toContain('https://pay.example.com/1')
  })

  it('answers in English for an English-speaking parent', () => {
    const withLink = resolvePaymentLine([{ amount: 250, payment_link: 'https://pay.example.com/1' }], 'en')
    const noLink = resolvePaymentLine([{ amount: 250, payment_link: null }], 'en')
    expect(withLink).toContain('pay here')
    expect(noLink).toContain('your teacher')
    expect(`${withLink}${noLink}`).not.toMatch(HEBREW)
  })
})

/**
 * The failure this guards against is not a missing translation — the Record
 * types make that a compile error — but a Hebrew FRAGMENT spliced into an
 * otherwise English body, which typechecks fine and ships broken.
 */
const HEBREW = /[֐-׿]/

const BRANCHES: Record<string, OpenCharge[]> = {
  'single charge with a link': [{ amount: 250, payment_link: 'https://pay.example.com/1' }],
  'several charges with links': [
    { amount: 250, payment_link: 'https://pay.example.com/1' },
    { amount: 100, payment_link: 'https://pay.example.com/2' },
  ],
  'no payment provider connected': [{ amount: 250, payment_link: null }],
}

function renderBalanceReply(charges: OpenCharge[], locale: AppLocale): string {
  return substituteVars(DEFAULT_TEMPLATES[locale].balance_reply, {
    // The body carries no currency symbol any more — the caller formats.
    total: formatBotMoney(sumOpenCharges(charges), locale),
    portal_url: 'https://www.getlessio.com/portal/org-id/payments',
    payment_line: resolvePaymentLine(charges, locale),
  })
}

describe('balance reply — bilingual', () => {
  for (const [name, charges] of Object.entries(BRANCHES)) {
    it(`renders fully in Hebrew — ${name}`, () => {
      const body = renderBalanceReply(charges, 'he')
      expect(body).not.toMatch(/\{\{/)
      expect(body).toMatch(HEBREW)
      expect(body).toContain(formatBotMoney(sumOpenCharges(charges), 'he'))
    })

    it(`renders fully in English, no Hebrew leaking in — ${name}`, () => {
      const body = renderBalanceReply(charges, 'en')
      expect(body).not.toMatch(/\{\{/)
      expect(body).not.toMatch(HEBREW)
    })
  }

  it('has a zero-balance reply in both languages', () => {
    expect(botString('balance_none', 'he')).toMatch(HEBREW)
    expect(botString('balance_none', 'en')).not.toMatch(HEBREW)
  })

  it('has a portal button label short enough for Meta in both languages', () => {
    for (const locale of ['he', 'en'] as const) {
      expect(botString('cta_open_portal', locale).length).toBeLessThanOrEqual(20)
    }
  })

  it('exposes the same placeholders in both languages', () => {
    const placeholders = (locale: AppLocale) =>
      [...DEFAULT_TEMPLATES[locale].balance_reply.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

    expect(placeholders('en')).toEqual(placeholders('he'))
    expect(placeholders('he')).toEqual(['payment_line', 'portal_url', 'total'])
  })
})
