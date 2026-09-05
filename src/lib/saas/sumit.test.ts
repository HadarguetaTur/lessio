/**
 * The wire format we send Sumit.
 *
 * These assert field names, not behaviour, because field names are exactly what
 * the previous client got wrong: it sent `Identifier` where Sumit reads
 * `ExternalIdentifier`, never sent `CancelRedirectURL` at all, and asked
 * payments/get for `ID` instead of `PaymentID`. Nothing failed loudly — the
 * money moved and the subscription never activated. A typo here is a silent
 * revenue outage, so the body is pinned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginSumitRedirect, chargeSumitCustomer, getSumitPayment, listSumitPayments } from './sumit'
import { SumitApiError } from './sumitParse'

const ORIGINAL_ENV = { ...process.env }

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockFetchSequence(bodies: unknown[]) {
  const fetchMock = vi.fn()
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(body) })
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string)
}

beforeEach(() => {
  process.env.SUMIT_COMPANY_ID = '12345'
  process.env.SUMIT_API_KEY = 'key-abc'
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

describe('beginSumitRedirect', () => {
  const params = {
    amount: 149,
    description: 'LESSIO Solo',
    customer: { name: 'Dana', email: 'dana@example.com', phone: null, externalIdentifier: 'org-1' },
    externalIdentifier: 'ref-1',
    redirectUrl: 'https://app.example/ok',
    cancelRedirectUrl: 'https://app.example/cancelled',
    language: 'he' as const,
  }

  it('sends the fields Sumit actually reads', async () => {
    const fetchMock = mockFetchOnce({ Status: 0, Data: { RedirectURL: 'https://pay.sumit/x' } })

    const res = await beginSumitRedirect(params)
    expect(res.redirectUrl).toBe('https://pay.sumit/x')

    const body = sentBody(fetchMock)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sumit.co.il/billing/payments/beginredirect/')
    // Echoed back to us as OG-ExternalIdentifier; this is the binding key.
    expect(body.ExternalIdentifier).toBe('ref-1')
    expect(body.RedirectURL).toBe('https://app.example/ok')
    expect(body.CancelRedirectURL).toBe('https://app.example/cancelled')
    // Invoice+receipt, no installments, Hebrew page.
    expect(body.DocumentType).toBe(1)
    expect(body.MaximumPayments).toBe(0)
    expect(body.Language).toBe(0)
    expect(body.VATIncluded).toBe(true)
    // The card must be saved on the customer, or renewals have nothing to charge.
    expect(body.PreventSavingPaymentMethod).toBe(false)
    expect(body.UpdateCustomerOnSuccess).toBe(true)
    // Files the card under our org id so reconciliation can find the customer.
    expect(body.Customer).toMatchObject({ ExternalIdentifier: 'org-1', SearchMode: 2 })
    expect(body.Credentials).toEqual({ CompanyID: 12345, APIKey: 'key-abc' })
  })

  it('sends the plan price as the total, with nothing added for VAT', async () => {
    // The company is a VAT-exempt dealer (עוסק פטור), which is what
    // PRICES_INCLUDE_VAT in ./pricing.ts encodes: VATIncluded=true tells Sumit
    // the UnitPrice we send is the final amount. ₪199 on the pricing page must
    // be ₪199 on the payment page — the two used to disagree, because the copy
    // promised "prices exclude VAT" while the checkout charged the total.
    const fetchMock = mockFetchOnce({ Status: 0, Data: { RedirectURL: 'https://pay.sumit/x' } })

    await beginSumitRedirect({ ...params, amount: 199 })

    const body = sentBody(fetchMock)
    expect(body.VATIncluded).toBe(true)
    expect((body.Items as Array<{ UnitPrice: number }>)[0].UnitPrice).toBe(199)
  })

  it('sends the English payment page for an English org', async () => {
    const fetchMock = mockFetchOnce({ Status: 0, Data: { RedirectURL: 'https://pay.sumit/x' } })
    await beginSumitRedirect({ ...params, language: 'en' })
    expect(sentBody(fetchMock).Language).toBe(1)
  })

  it('throws when Sumit refuses', async () => {
    mockFetchOnce({ Status: 1, UserErrorMessage: 'No terminal configured' })
    await expect(beginSumitRedirect(params)).rejects.toThrow(SumitApiError)
  })

  it('throws when Sumit succeeds without a URL', async () => {
    mockFetchOnce({ Status: 0, Data: {} })
    await expect(beginSumitRedirect(params)).rejects.toThrow(SumitApiError)
  })
})

describe('getSumitPayment', () => {
  it('asks for PaymentID as a number and reads Data.Payment', async () => {
    const fetchMock = mockFetchOnce({
      Status: 0,
      Data: {
        Payment: {
          ID: 90210,
          CustomerID: 555,
          ValidPayment: true,
          Amount: 149,
          PaymentMethod: { CreditCard_Token: 'tok', CreditCard_LastDigits: '4242' },
        },
      },
    })

    const payment = await getSumitPayment('90210')

    expect(sentBody(fetchMock).PaymentID).toBe(90210)
    expect(payment).toMatchObject({ id: '90210', customerId: '555', valid: true, token: 'tok' })
  })

  it('refuses a non-numeric payment id without calling Sumit', async () => {
    const fetchMock = mockFetchOnce({ Status: 0, Data: {} })
    await expect(getSumitPayment('not-a-number')).rejects.toThrow(SumitApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('listSumitPayments', () => {
  it('pages until HasNextPage is false', async () => {
    const fetchMock = mockFetchSequence([
      {
        Status: 0,
        Data: {
          Payments: [{ ID: 1, CustomerID: 5, ValidPayment: true, Amount: 149 }],
          HasNextPage: true,
        },
      },
      {
        Status: 0,
        Data: {
          Payments: [{ ID: 2, CustomerID: 5, ValidPayment: true, Amount: 149 }],
          HasNextPage: false,
        },
      },
    ])

    const payments = await listSumitPayments({
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-09-02T00:00:00Z'),
      validOnly: true,
    })

    expect(payments.map((p) => p.id)).toEqual(['1', '2'])
    expect(sentBody(fetchMock, 0)).toMatchObject({
      Date_From: '2026-09-01',
      Date_To: '2026-09-02',
      StartIndex: 0,
    })
    expect(sentBody(fetchMock, 1).StartIndex).toBe(1)
  })
})

describe('chargeSumitCustomer', () => {
  const params = {
    customerId: '555',
    token: 'tok_abc',
    amount: 149,
    description: 'LESSIO Solo',
    language: 'he' as const,
  }

  it('charges the stored token and reads the document off Data', async () => {
    const fetchMock = mockFetchOnce({
      Status: 0,
      Data: {
        Payment: {
          ID: 5,
          CustomerID: 555,
          ValidPayment: true,
          Amount: 149,
          PaymentMethod: {
            CreditCard_LastDigits: '4242',
            CreditCard_ExpirationMonth: 11,
            CreditCard_ExpirationYear: 2029,
          },
        },
        DocumentID: 777,
        DocumentNumber: 1042,
        DocumentDownloadURL: 'https://sumit/doc.pdf',
      },
    })

    const result = await chargeSumitCustomer({ ...params, sendDocumentByEmail: true })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.documentId).toBe('777')
      expect(result.documentUrl).toBe('https://sumit/doc.pdf')
      expect(result.payment.last4).toBe('4242')
    }
    const body = sentBody(fetchMock)
    expect(body.PaymentMethod).toEqual({ CreditCard_Token: 'tok_abc', Type: 1 })
    expect(body.Customer).toEqual({ ID: 555 })
    expect(body.AuthoriseOnly).toBe(false)
    expect(body.SendDocumentByEmail).toBe(true)
  })

  it('omits PaymentMethod so Sumit uses the saved default when we hold no token', async () => {
    const fetchMock = mockFetchOnce({
      Status: 0,
      Data: { Payment: { ID: 5, CustomerID: 555, ValidPayment: true, Amount: 149 } },
    })
    await chargeSumitCustomer({ ...params, token: null })
    expect(sentBody(fetchMock).PaymentMethod).toBeUndefined()
  })

  it('reports a BusinessError as a decline, not an exception', async () => {
    // A declined card is an expected outcome the dunning ladder schedules around.
    mockFetchOnce({ Status: 1, UserErrorMessage: 'Card expired' })
    const result = await chargeSumitCustomer(params)
    expect(result).toMatchObject({ ok: false, reason: 'Card expired' })
  })

  it('reports success-with-invalid-payment as a decline', async () => {
    mockFetchOnce({
      Status: 0,
      Data: {
        Payment: { ID: 5, CustomerID: 555, ValidPayment: false, Amount: 149, StatusDescription: 'Refused' },
      },
    })
    const result = await chargeSumitCustomer(params)
    expect(result).toMatchObject({ ok: false, reason: 'Refused' })
  })

  it('throws on a TechnicalError so the attempt is not counted', async () => {
    // An outage must not burn one of a customer three retries.
    mockFetchOnce({ Status: 2, TechnicalErrorDetails: 'gateway down' })
    await expect(chargeSumitCustomer(params)).rejects.toThrow(SumitApiError)
  })

  it('throws on an HTTP failure', async () => {
    mockFetchOnce({ Status: 2 }, 500)
    await expect(chargeSumitCustomer(params)).rejects.toThrow(SumitApiError)
  })

  it('passes AuthoriseOnly through for the cutover dry run', async () => {
    const fetchMock = mockFetchOnce({
      Status: 0,
      Data: { Payment: { ID: 5, CustomerID: 555, ValidPayment: true, Amount: 149 } },
    })
    await chargeSumitCustomer({ ...params, authoriseOnly: true })
    expect(sentBody(fetchMock).AuthoriseOnly).toBe(true)
  })
})
