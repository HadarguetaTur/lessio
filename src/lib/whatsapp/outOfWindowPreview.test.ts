/**
 * The second bubble on the settings card must resolve to the SAME template the
 * senders would pick, or it becomes another thing that says one message and
 * delivers another.
 */

import { describe, expect, it } from 'vitest'
import { resolveOutOfWindowPreview } from './outOfWindowPreview'
import { TEMPLATE_PREVIEW_VARS } from './templates'
import type { TemplateStatusRow } from './templateStatus'

function row(over: Partial<TemplateStatusRow>): TemplateStatusRow {
  return {
    templateName: 'x',
    language: 'he',
    status: 'APPROVED',
    reason: null,
    type: null,
    version: null,
    bodyText: null,
    varOrder: null,
    updatedAt: '2026-08-30T00:00:00Z',
    ...over,
  }
}

const HE_VARS = TEMPLATE_PREVIEW_VARS.he.payment_request

describe('resolution order mirrors sendSmart', () => {
  it("prefers the org's own approved wording", () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [
        row({
          templateName: 'lessio_payment_request_he_c1',
          type: 'payment_request',
          version: 1,
          bodyText: 'הנוסח שלנו: {{1}} עבור {{2}}',
          varOrder: ['amount', 'description'],
        }),
        row({ templateName: 'lessio_payment_request_he_v3' }),
      ],
      previewVars: HE_VARS,
    })

    expect(result?.source).toBe('custom')
    expect(result?.metaName).toBe('lessio_payment_request_he_c1')
    expect(result?.body).toBe('הנוסח שלנו: ₪250.00 עבור שיעור מתמטיקה')
    // A body-only submission cannot carry a button — sendSmart skips the v3
    // path entirely when a custom template exists.
    expect(result?.buttons).toEqual([])
  })

  it('takes the highest approved version of the org wording', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [
        row({ templateName: 'c1', type: 'payment_request', version: 1, bodyText: 'ישן {{1}}', varOrder: ['amount'] }),
        row({ templateName: 'c2', type: 'payment_request', version: 2, bodyText: 'חדש {{1}}', varOrder: ['amount'] }),
      ],
      previewVars: HE_VARS,
    })

    expect(result?.metaName).toBe('c2')
  })

  it('ignores a PENDING org submission — Meta still sends the built-in', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [
        row({
          templateName: 'c1',
          type: 'payment_request',
          status: 'PENDING',
          version: 1,
          bodyText: 'ממתין {{1}}',
          varOrder: ['amount'],
        }),
      ],
      previewVars: HE_VARS,
    })

    expect(result?.source).not.toBe('custom')
  })

  it('uses the v3 built-in with its button once Meta approved it', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [row({ templateName: 'lessio_payment_request_he_v3', status: 'APPROVED' })],
      previewVars: HE_VARS,
    })

    expect(result?.source).toBe('builtin_v3')
    expect(result?.buttons).toEqual([{ kind: 'url', label: 'לתשלום מאובטח' }])
    // v3 dropped the link line, so the amount is its only parameter.
    expect(result?.body).toContain('₪250.00')
    expect(result?.body).not.toContain('https://')
  })

  it('degrades to v2 while v3 is still PENDING — the normal state today', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [row({ templateName: 'lessio_payment_request_he_v3', status: 'PENDING' })],
      previewVars: HE_VARS,
    })

    expect(result?.source).toBe('builtin_v2')
    expect(result?.metaName).toBe('lessio_payment_request_he_v2')
    // v2 keeps the link inline and has no button.
    expect(result?.body).toContain('https://pay.example.com/abc')
    expect(result?.buttons).toEqual([])
  })

  it('reports PENDING for a built-in Meta has said nothing about', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [],
      previewVars: HE_VARS,
    })

    expect(result?.status).toBe('PENDING')
  })

  it('resolves the English template for an English recipient', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'en',
      rows: [],
      previewVars: TEMPLATE_PREVIEW_VARS.en.payment_request,
    })

    expect(result?.metaName).toBe('lessio_payment_request_en_v2')
    expect(result?.body).not.toMatch(/[\u0590-\u05FF]/)
  })

  it('returns null for a type that is only ever a reply', () => {
    expect(
      resolveOutOfWindowPreview({
        type: 'balance_reply',
        locale: 'he',
        rows: [],
        previewVars: TEMPLATE_PREVIEW_VARS.he.balance_reply,
      })
    ).toBeNull()
  })
})

describe('parameters render the way Meta renders them', () => {
  it('flattens a multi-line value, because Meta rejects newlines in a parameter', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [
        row({
          templateName: 'c1',
          type: 'payment_request',
          version: 1,
          bodyText: 'פירוט: {{1}}',
          varOrder: ['charge_lines'],
        }),
      ],
      previewVars: { charge_lines: '\n1. שיעור: ₪250.00\n2. שיעור: ₪250.00' },
    })

    expect(result?.body).not.toContain('\n')
    expect(result?.body).toContain('1. שיעור: ₪250.00 2. שיעור: ₪250.00')
  })

  it('shows the fallback Meta would substitute for an empty value', () => {
    const result = resolveOutOfWindowPreview({
      type: 'payment_request',
      locale: 'he',
      rows: [
        row({
          templateName: 'c1',
          type: 'payment_request',
          version: 1,
          bodyText: 'פירוט: {{1}}',
          varOrder: ['charge_lines'],
        }),
      ],
      previewVars: { charge_lines: '' },
    })

    expect(result?.body).toBe('פירוט: —')
  })
})
