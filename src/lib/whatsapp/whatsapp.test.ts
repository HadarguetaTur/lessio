import { describe, it, expect } from 'vitest'
import { parseWebhookPayload, parseTemplateStatusUpdates, hasBookingIntent } from './parsePayload'
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

  it('surfaces unreadable media as an unsupported message', () => {
    const result = parseWebhookPayload(makePayload({ type: 'image' }))
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('')
    expect(result[0].unsupportedType).toBe('image')
  })

  it('stays silent on reactions and Meta unsupported markers', () => {
    expect(parseWebhookPayload(makePayload({ type: 'reaction' }))).toHaveLength(0)
    expect(parseWebhookPayload(makePayload({ type: 'unsupported' }))).toHaveLength(0)
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

  // Regression: the schema used to demand the messages shape on every change, so
  // a template status change riding along in the same delivery failed the whole
  // safeParse and the real message was silently dropped.
  it('still extracts a message when a template status change shares the payload', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-1',
        changes: [
          {
            field: 'message_template_status_update',
            value: {
              event: 'APPROVED',
              message_template_id: 12345,
              message_template_name: 'lessio_lesson_reminder_en_c1',
              message_template_language: 'en',
              reason: 'NONE',
            },
          },
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '0521234567', phone_number_id: 'phone-id-1' },
              messages: [{ from: '972501234567', id: 'msg-1', type: 'text', text: { body: 'שלום' } }],
            },
          },
        ],
      }],
    }

    const result = parseWebhookPayload(payload)
    expect(result).toHaveLength(1)
    expect(result[0].messageId).toBe('msg-1')
  })

  it('skips one malformed messages change without dropping a valid sibling', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-1',
        changes: [
          { field: 'messages', value: { messaging_product: 'whatsapp' } },
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '0521234567', phone_number_id: 'phone-id-1' },
              messages: [{ from: '972501234567', id: 'msg-2', type: 'text', text: { body: 'hi' } }],
            },
          },
        ],
      }],
    }

    const result = parseWebhookPayload(payload)
    expect(result).toHaveLength(1)
    expect(result[0].messageId).toBe('msg-2')
  })
})

// ── parseTemplateStatusUpdates ────────────────────────────────────────────────

function makeStatusPayload(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field: 'message_template_status_update', value }] }],
  }
}

describe('parseTemplateStatusUpdates', () => {
  it('extracts a status change and resolves it to the WABA from entry.id', () => {
    const result = parseTemplateStatusUpdates(makeStatusPayload({
      event: 'APPROVED',
      message_template_name: 'lessio_lesson_reminder_en_c1',
      message_template_language: 'en',
      reason: 'NONE',
    }))

    expect(result).toEqual([{
      wabaId: 'waba-1',
      templateName: 'lessio_lesson_reminder_en_c1',
      language: 'en',
      status: 'APPROVED',
      reason: null,
    }])
  })

  it('keeps a real rejection reason', () => {
    const result = parseTemplateStatusUpdates(makeStatusPayload({
      event: 'REJECTED',
      message_template_name: 'lessio_payment_request_he_c2',
      message_template_language: 'he',
      reason: 'INVALID_FORMAT',
    }))

    expect(result[0]).toMatchObject({ status: 'REJECTED', reason: 'INVALID_FORMAT' })
  })

  it('treats a missing reason the same as Meta\'s literal "NONE"', () => {
    const result = parseTemplateStatusUpdates(makeStatusPayload({
      event: 'PENDING',
      message_template_name: 'lessio_lesson_reminder_he_c1',
      message_template_language: 'he',
    }))

    expect(result[0].reason).toBeNull()
  })

  it('uppercases the event so it matches the stored vocabulary', () => {
    const result = parseTemplateStatusUpdates(makeStatusPayload({
      event: 'approved',
      message_template_name: 'lessio_lesson_reminder_he_c1',
      message_template_language: 'he',
    }))

    expect(result[0].status).toBe('APPROVED')
  })

  it('ignores message payloads and malformed status changes', () => {
    expect(parseTemplateStatusUpdates(makePayload())).toHaveLength(0)
    expect(parseTemplateStatusUpdates(makeStatusPayload({ event: 'APPROVED' }))).toHaveLength(0)
    expect(parseTemplateStatusUpdates(null)).toHaveLength(0)
    expect(parseTemplateStatusUpdates({})).toHaveLength(0)
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
