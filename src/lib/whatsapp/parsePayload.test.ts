import { describe, it, expect } from 'vitest'
import { parseAccountHealthUpdates, parseDeliveryStatuses, parseWebhookPayload } from './parsePayload'

/** A `messages` change the way Meta batches it: statuses and messages side by side. */
function envelope(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field: 'messages', value }] }],
  }
}

const metadata = { display_phone_number: '972552451476', phone_number_id: 'pnid-1' }

describe('parseDeliveryStatuses()', () => {
  it('extracts a delivered status with the wamid and the sending line', () => {
    const result = parseDeliveryStatuses(
      envelope({
        messaging_product: 'whatsapp',
        metadata,
        statuses: [
          { id: 'wamid.OUT', status: 'delivered', timestamp: '1788858000', recipient_id: '972504343547' },
        ],
      })
    )

    expect(result).toEqual([
      {
        phoneNumberId: 'pnid-1',
        waMessageId: 'wamid.OUT',
        status: 'delivered',
        errorCode: null,
        errorMessage: null,
      },
    ])
  })

  it('keeps the code and the human text of a failure', () => {
    const result = parseDeliveryStatuses(
      envelope({
        messaging_product: 'whatsapp',
        metadata,
        statuses: [
          {
            id: 'wamid.OUT',
            status: 'failed',
            errors: [
              {
                code: 131026,
                title: 'Message undeliverable',
                message: 'Message undeliverable',
                error_data: { details: 'Message Undeliverable.' },
              },
            ],
          },
        ],
      })
    )

    expect(result).toEqual([
      expect.objectContaining({
        status: 'failed',
        errorCode: 131026,
        errorMessage: 'Message undeliverable — Message Undeliverable.',
      }),
    ])
  })

  it('drops statuses we do not track and normalises case', () => {
    const result = parseDeliveryStatuses(
      envelope({
        messaging_product: 'whatsapp',
        metadata,
        statuses: [
          { id: 'a', status: 'deleted' },
          { id: 'b', status: 'warning' },
          { id: 'c', status: 'READ' },
        ],
      })
    )

    expect(result.map((r) => [r.waMessageId, r.status])).toEqual([['c', 'read']])
  })

  it('returns nothing for a change that carries only messages', () => {
    const payload = envelope({
      messaging_product: 'whatsapp',
      metadata,
      messages: [{ from: '972504343547', id: 'wamid.IN', type: 'text', text: { body: 'היי' } }],
    })

    expect(parseDeliveryStatuses(payload)).toEqual([])
    expect(parseWebhookPayload(payload)).toHaveLength(1)
  })

  it('does not let a status entry hide the message batched beside it', () => {
    const payload = envelope({
      messaging_product: 'whatsapp',
      metadata,
      messages: [{ from: '972504343547', id: 'wamid.IN', type: 'text', text: { body: 'היי' } }],
      statuses: [{ id: 'wamid.OUT', status: 'read' }],
    })

    expect(parseWebhookPayload(payload)).toHaveLength(1)
    expect(parseDeliveryStatuses(payload)).toHaveLength(1)
  })

  it('ignores a template status change and malformed bodies', () => {
    expect(
      parseDeliveryStatuses({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-1',
            changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED' } }],
          },
        ],
      })
    ).toEqual([])
    expect(parseDeliveryStatuses({ object: 'page' })).toEqual([])
    expect(parseDeliveryStatuses(null)).toEqual([])
  })
})

describe('parseAccountHealthUpdates()', () => {
  const envelope = (field: string, value: unknown) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field, value }] }],
  })

  it('reads a quality flag and a tier change', () => {
    const flagged = parseAccountHealthUpdates(
      envelope('phone_number_quality_update', { display_phone_number: '972501234567', event: 'FLAGGED', current_limit: 'TIER_250' })
    )
    expect(flagged).toEqual([
      { wabaId: 'waba-1', field: 'phone_number_quality_update', event: 'FLAGGED', currentLimit: 'TIER_250', detail: null },
    ])

    const upgraded = parseAccountHealthUpdates(
      envelope('phone_number_quality_update', { event: 'upgrade', current_limit: 'TIER_2K' })
    )
    expect(upgraded[0]).toMatchObject({ event: 'UPGRADE', currentLimit: 'TIER_2K' })
  })

  it('collects restriction details from an account_update', () => {
    const [update] = parseAccountHealthUpdates(
      envelope('account_update', {
        event: 'ACCOUNT_RESTRICTION',
        restriction_info: [{ restriction_type: 'RESTRICTED_ADD_PHONE_NUMBER_ACTION', expiration: '2026-10-01' }],
      })
    )
    expect(update).toMatchObject({ field: 'account_update', event: 'ACCOUNT_RESTRICTION', detail: 'RESTRICTED_ADD_PHONE_NUMBER_ACTION' })
  })

  it('maps a display-name decision, dropping NONE as a reason', () => {
    const [update] = parseAccountHealthUpdates(
      envelope('phone_number_name_update', { decision: 'APPROVED', rejection_reason: 'NONE' })
    )
    expect(update).toMatchObject({ field: 'phone_number_name_update', event: 'APPROVED', detail: null })
  })

  it('ignores unrelated fields and malformed values', () => {
    expect(parseAccountHealthUpdates(envelope('messages', { messaging_product: 'whatsapp' }))).toEqual([])
    expect(parseAccountHealthUpdates(envelope('account_update', { nothing: true }))).toEqual([])
    expect(parseAccountHealthUpdates({ object: 'page' })).toEqual([])
  })
})
