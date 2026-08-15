import { describe, it, expect } from 'vitest'
import { parseWebhookPayload, hasBookingIntent } from './parsePayload'
import type { MetaWebhookPayload } from './parsePayload'

// ── parseWebhookPayload ───────────────────────────────────────────────────────

function makePayload(overrides?: Partial<{
  object: string
  from: string
  text: string
  displayPhone: string
  phoneNumberId: string
  type: string
}>): MetaWebhookPayload {
  const o = { object: 'whatsapp_business_account', from: '972501234567', text: 'שיעור', displayPhone: '0521234567', phoneNumberId: 'phone-id-1', type: 'text', ...overrides }
  return {
    object: o.object as MetaWebhookPayload['object'],
    entry: [{
      id: 'entry-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: o.displayPhone, phone_number_id: o.phoneNumberId },
          messages: [{
            from: o.from,
            id: 'msg-1',
            type: o.type as 'text',
            text: { body: o.text },
          }],
        },
      }],
    }],
  }
}

describe('parseWebhookPayload', () => {
  it('extracts a text message from a well-formed payload', () => {
    const result = parseWebhookPayload(makePayload())
    expect(result).toHaveLength(1)
    expect(result[0].from).toBe('972501234567')
    expect(result[0].text).toBe('שיעור')
    expect(result[0].businessPhoneNumber).toBe('0521234567')
    expect(result[0].phoneNumberId).toBe('phone-id-1')
  })

  it('returns empty array when object is not whatsapp_business_account', () => {
    const result = parseWebhookPayload(makePayload({ object: 'instagram' }))
    expect(result).toHaveLength(0)
  })

  it('ignores non-text messages', () => {
    const result = parseWebhookPayload(makePayload({ type: 'image' }))
    expect(result).toHaveLength(0)
  })

  it('returns empty array for a status update (no messages array)', () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '0521234567', phone_number_id: 'id' },
            // no messages array (status update only)
          },
        }],
      }],
    }
    const result = parseWebhookPayload(payload)
    expect(result).toHaveLength(0)
  })

  it('returns empty array for null/undefined input', () => {
    expect(parseWebhookPayload(null)).toHaveLength(0)
    expect(parseWebhookPayload(undefined)).toHaveLength(0)
    expect(parseWebhookPayload({})).toHaveLength(0)
  })

  it('returns empty array when required metadata is missing', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry-1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '0521234567' },
            messages: [{ from: '972501234567', id: 'msg-1', type: 'text', text: { body: 'שלום' } }],
          },
        }],
      }],
    }

    expect(parseWebhookPayload(payload)).toHaveLength(0)
  })

  it('extracts multiple messages from multiple entries', () => {
    const payload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'e1',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '050', phone_number_id: 'p1' },
              messages: [{ from: '111', id: 'm1', type: 'text', text: { body: 'hello' } }],
            },
          }],
        },
        {
          id: 'e2',
          changes: [{
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '050', phone_number_id: 'p1' },
              messages: [{ from: '222', id: 'm2', type: 'text', text: { body: 'שיעור' } }],
            },
          }],
        },
      ],
    }
    const result = parseWebhookPayload(payload)
    expect(result).toHaveLength(2)
    expect(result[0].from).toBe('111')
    expect(result[1].from).toBe('222')
  })
})

// ── hasBookingIntent ──────────────────────────────────────────────────────────

describe('hasBookingIntent', () => {
  it('returns false for generic lesson mentions without a booking verb', () => {
    expect(hasBookingIntent('שיעור')).toBe(false)
    expect(hasBookingIntent('כמה עולה שיעור?')).toBe(false)
  })

  it('returns true for "קביעה"', () => {
    expect(hasBookingIntent('רוצה קביעה לשיעור')).toBe(true)
  })

  it('returns false for unrelated messages', () => {
    expect(hasBookingIntent('שלום, מה שלומך?')).toBe(false)
  })

  it('matches keywords embedded in longer sentences', () => {
    expect(hasBookingIntent('אפשר לקבוע שיעור מחר?')).toBe(true)
    expect(hasBookingIntent('אשמח להזמנה לשיעור ניסיון')).toBe(true)
    expect(hasBookingIntent('לא רוצה כלום')).toBe(false)
  })
})
