import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import { PayPlusProvider } from './payplus'

const SECRET = 'payplus-secret'
const BODY = JSON.stringify({
  payment_request_uid: 'page-1', status: 'success', amount: 100, more_info: 'charge-1',
})

describe('PayPlus callback verification', () => {
  const provider = new PayPlusProvider({ apiKey: 'api', secretKey: SECRET, pageUid: 'page' })

  it('accepts the documented hash and user-agent mechanism', () => {
    const hash = createHmac('sha256', SECRET).update(BODY).digest('base64')
    expect(provider.verifyWebhookRequest(
      new Headers({ hash, 'user-agent': 'PayPlus' }), BODY
    )).toBe(true)
  })

  it('rejects forged payloads, hashes, and user agents', () => {
    const hash = createHmac('sha256', SECRET).update(BODY).digest('base64')
    expect(provider.verifyWebhookRequest(
      new Headers({ hash, 'user-agent': 'browser' }), BODY
    )).toBe(false)
    expect(provider.verifyWebhookRequest(
      new Headers({ hash, 'user-agent': 'PayPlus' }),
      JSON.stringify({
        payment_request_uid: 'page-1', status: 'failure', amount: 100, more_info: 'charge-1',
      })
    )).toBe(false)
    expect(provider.verifyWebhookRequest(
      new Headers({ hash: 'forged', 'user-agent': 'PayPlus' }), BODY
    )).toBe(false)
  })
})
