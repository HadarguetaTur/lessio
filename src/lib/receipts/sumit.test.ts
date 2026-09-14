/**
 * The Sumit receipt adapter's wire format and envelope reading.
 *
 * Pinned because this adapter was written against a guessed contract: it
 * checked a `Succeed` field that does not exist, so every successful issuance
 * looked like a failure, and it posted to a path that does not exist either.
 * Field names here are asserted against
 * https://api.sumit.co.il/swagger/v1/swagger.json.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SumitProvider } from './sumit'
import { SumitApiError } from '@/lib/saas/sumitParse'

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string)
}

function provider() {
  return new SumitProvider({ companyId: '12345', apiKey: 'secret-key' })
}

const RECEIPT_PARAMS = {
  chargeId: 'charge-1',
  amount: 350,
  parentName: 'דנה כהן',
  description: 'שיעור - מאיה',
  orgName: 'סטודיו מיכל',
  date: '2026-09-09',
}

const SUCCESS = {
  Status: 0,
  UserErrorMessage: null,
  TechnicalErrorDetails: null,
  Data: {
    DocumentID: 987654,
    DocumentNumber: 42,
    CustomerID: 5,
    DocumentDownloadURL: 'https://app.sumit.co.il/doc/987654.pdf',
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SumitProvider.issueReceipt', () => {
  it('reads the { Status, Data } envelope and returns the document', async () => {
    const fetchMock = mockFetchOnce(SUCCESS)

    const result = await provider().issueReceipt(RECEIPT_PARAMS)

    expect(result).toEqual({
      receiptUrl: 'https://app.sumit.co.il/doc/987654.pdf',
      receiptId: '987654',
      documentType: 'receipt',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sumit.co.il/accounting/documents/create/')
  })

  it('sends the documented request shape', async () => {
    const fetchMock = mockFetchOnce(SUCCESS)
    await provider().issueReceipt(RECEIPT_PARAMS)
    const body = sentBody(fetchMock)

    // CompanyID is an integer in Core_APICredentials, not the stored string.
    expect(body.Credentials).toEqual({ CompanyID: 12345, APIKey: 'secret-key' })

    // Receipt = ordinal 2. 400 is iCount's code and was never Sumit's.
    expect(body.Details.Type).toBe(2)
    expect(body.Details.Customer.Name).toBe('דנה כהן')
    expect(body.Details.ExternalReference).toBe('charge-1')
    expect(body.Details.Date).toBe('2026-09-09')

    // The money that moved: one item at the VAT-inclusive amount, one payment.
    expect(body.Items).toHaveLength(1)
    expect(body.Items[0].UnitPrice).toBe(350)
    expect(body.Items[0].Quantity).toBe(1)
    expect(body.Payments).toEqual([{ Amount: 350, Type: 1 }])
    expect(body.VATIncluded).toBe(true)

    // Fields the old adapter invented must not be sent.
    expect(body).not.toHaveProperty('DocumentType')
    expect(body).not.toHaveProperty('ClientName')
    expect(body).not.toHaveProperty('Reference')
  })

  it('issues an invoice+receipt for a tax invoice and forwards the contained VAT', async () => {
    const fetchMock = mockFetchOnce(SUCCESS)

    const result = await provider().issueReceipt({
      ...RECEIPT_PARAMS,
      documentType: 'tax_invoice',
      vatAmount: 53.39,
      customerTaxId: '514999999',
    })

    const body = sentBody(fetchMock)
    expect(body.Details.Type).toBe(1) // InvoiceAndReceipt
    expect(body.Details.Customer.CompanyNumber).toBe('514999999')
    expect(body.VATPerItem).toBe(true)
    expect(body.Items[0].VAT).toBe(53.39)
    // The total still equals what was collected — VAT is inside it.
    expect(body.Items[0].UnitPrice).toBe(350)
    expect(result.documentType).toBe('tax_invoice')
  })

  it('does not claim VAT when the caller supplied none', async () => {
    const fetchMock = mockFetchOnce(SUCCESS)
    await provider().issueReceipt(RECEIPT_PARAMS)
    const body = sentBody(fetchMock)
    expect(body).not.toHaveProperty('VATPerItem')
    expect(body.Items[0]).not.toHaveProperty('VAT')
  })

  it('falls back to the app document link when Sumit returns no download URL', async () => {
    mockFetchOnce({ ...SUCCESS, Data: { ...SUCCESS.Data, DocumentDownloadURL: null } })
    const result = await provider().issueReceipt(RECEIPT_PARAMS)
    expect(result.receiptUrl).toBe('https://app.sumit.co.il/documents/987654')
  })

  it('throws on a BusinessError envelope, carrying Sumit’s own wording', async () => {
    mockFetchOnce({
      Status: 1,
      UserErrorMessage: 'מפתח API שגוי',
      TechnicalErrorDetails: null,
      Data: null,
    })

    await expect(provider().issueReceipt(RECEIPT_PARAMS)).rejects.toThrow(SumitApiError)
    await expect(provider().issueReceipt(RECEIPT_PARAMS)).rejects.toThrow('מפתח API שגוי')
  })

  it('accepts the string form of the status enum', async () => {
    mockFetchOnce({ ...SUCCESS, Status: 'Success (0)' })
    await expect(provider().issueReceipt(RECEIPT_PARAMS)).resolves.toMatchObject({
      receiptId: '987654',
    })
  })

  /**
   * The regression this file exists for: the old adapter read `json.Succeed`,
   * which Sumit never sends, so `!json.Succeed` was true on every success and
   * every issued receipt threw "Document creation failed" — while the document
   * had in fact been created.
   */
  it('does not treat a real success as a failure', async () => {
    mockFetchOnce(SUCCESS)
    await expect(provider().issueReceipt(RECEIPT_PARAMS)).resolves.toBeTruthy()
  })

  it('rejects a success envelope with no DocumentID rather than inventing one', async () => {
    mockFetchOnce({ ...SUCCESS, Data: { DocumentNumber: 42 } })
    await expect(provider().issueReceipt(RECEIPT_PARAMS)).rejects.toThrow(/DocumentID/)
  })
})

describe('SumitProvider.validateCredentials', () => {
  it('calls the VAT-rate endpoint and resolves on Success', async () => {
    const fetchMock = mockFetchOnce({ Status: 0, Data: { Rate: 18 } })
    await expect(provider().validateCredentials()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sumit.co.il/accounting/general/getvatrate/')
  })

  it('surfaces the user-facing message when the credentials are refused', async () => {
    mockFetchOnce({ Status: 1, UserErrorMessage: 'Invalid API key', Data: null })
    await expect(provider().validateCredentials()).rejects.toThrow('Invalid API key')
  })
})
