/**
 * The envelope Sumit actually returns.
 *
 * The client this replaced checked a `Succeed` boolean and read `ReturnValue`,
 * neither of which exists in Sumit's API. Every response therefore parsed as a
 * success with undefined data — including declines. These tests pin the real
 * shape (verified against api.sumit.co.il/swagger/v1/swagger.json) so that
 * mistake cannot come back: the spec declares Status as a string enum while the
 * API serialises it as a number, so both are accepted and both are tested.
 */

import { describe, expect, it } from 'vitest'
import {
  SumitApiError,
  isChargeDeclined,
  normalizePayment,
  sumitStatusCode,
  unwrapSumit,
  type SumitPaymentRaw,
} from './sumitParse'

describe('sumitStatusCode', () => {
  it('reads the numeric serialisation the API sends', () => {
    expect(sumitStatusCode(0)).toBe(0)
    expect(sumitStatusCode(1)).toBe(1)
    expect(sumitStatusCode(2)).toBe(2)
  })

  it('reads the string enum the OpenAPI spec declares', () => {
    expect(sumitStatusCode('Success (0)')).toBe(0)
    expect(sumitStatusCode('BusinessError (1)')).toBe(1)
    expect(sumitStatusCode('TechnicalError (2)')).toBe(2)
  })

  it('reads a bare numeric string', () => {
    expect(sumitStatusCode('0')).toBe(0)
    expect(sumitStatusCode('2')).toBe(2)
  })

  it('refuses to guess at anything else', () => {
    // The dangerous direction is treating an unknown status as success.
    expect(sumitStatusCode(undefined)).toBeNull()
    expect(sumitStatusCode(null)).toBeNull()
    expect(sumitStatusCode('')).toBeNull()
    expect(sumitStatusCode('Succeeded')).toBeNull()
    expect(sumitStatusCode(7)).toBeNull()
  })
})

describe('unwrapSumit', () => {
  it('returns Data on success', () => {
    const data = unwrapSumit<{ RedirectURL: string }>('/p/', 200, {
      Status: 0,
      Data: { RedirectURL: 'https://pay.example/x' },
    })
    expect(data.RedirectURL).toBe('https://pay.example/x')
  })

  it('throws a BusinessError with Sumit\u2019s own wording', () => {
    try {
      unwrapSumit('/p/', 200, {
        Status: 'BusinessError (1)',
        UserErrorMessage: 'Card declined',
        Data: null,
      })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(SumitApiError)
      const err = e as SumitApiError
      expect(err.code).toBe(1)
      expect(err.isBusinessError).toBe(true)
      expect(err.userMessage).toBe('Card declined')
    }
  })

  it('throws on a TechnicalError', () => {
    expect(() => unwrapSumit('/p/', 200, { Status: 2, TechnicalErrorDetails: 'boom' })).toThrow(
      SumitApiError
    )
  })

  it('throws when the status is missing entirely', () => {
    // HTTP 200 with no status must never be read as success.
    expect(() => unwrapSumit('/p/', 200, { Data: { anything: true } })).toThrow(SumitApiError)
  })

  it('throws on a success envelope with no Data object', () => {
    expect(() => unwrapSumit('/p/', 200, { Status: 0, Data: null })).toThrow(SumitApiError)
  })

  it('throws when the body is not an object', () => {
    expect(() => unwrapSumit('/p/', 200, 'nope')).toThrow(SumitApiError)
  })
})

const RAW: SumitPaymentRaw = {
  ID: 90210,
  CustomerID: 555,
  Date: '2026-09-02T10:00:00',
  ValidPayment: true,
  Status: '000',
  StatusDescription: 'Approved',
  Amount: 149,
  PaymentMethod: {
    CreditCard_Token: 'tok_abc',
    CreditCard_LastDigits: '4242',
    CreditCard_ExpirationMonth: 11,
    CreditCard_ExpirationYear: 2029,
    Type: 1,
  },
  AuthNumber: '12345',
}

describe('normalizePayment', () => {
  it('lifts the card fields out of PaymentMethod', () => {
    const p = normalizePayment(RAW)
    expect(p).toMatchObject({
      id: '90210',
      customerId: '555',
      valid: true,
      amount: 149,
      token: 'tok_abc',
      last4: '4242',
      expiryMonth: 11,
      expiryYear: 2029,
    })
  })

  it('tolerates a payment with no PaymentMethod', () => {
    const p = normalizePayment({ ...RAW, PaymentMethod: null })
    expect(p.token).toBeNull()
    expect(p.last4).toBeNull()
    expect(p.valid).toBe(true)
  })

  it('treats a missing ValidPayment as not valid', () => {
    const p = normalizePayment({ ...RAW, ValidPayment: undefined as unknown as boolean })
    expect(p.valid).toBe(false)
  })
})

describe('isChargeDeclined', () => {
  it('accepts only a success envelope carrying a valid payment', () => {
    expect(isChargeDeclined(0, normalizePayment(RAW))).toBe(false)
  })

  it('treats success with ValidPayment=false as a decline', () => {
    // Sumit answers this way for a refused card, which the old client read as success.
    expect(isChargeDeclined(0, normalizePayment({ ...RAW, ValidPayment: false }))).toBe(true)
  })

  it('treats a BusinessError as a decline', () => {
    expect(isChargeDeclined(1, null)).toBe(true)
  })

  it('treats a missing payment as a decline', () => {
    expect(isChargeDeclined(0, null)).toBe(true)
  })
})
