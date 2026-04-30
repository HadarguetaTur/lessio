/**
 * iCount (אייקאונט) receipt adapter.
 *
 * API reference: https://api.icount.co.il/api/v3.php
 *
 * Auth flow (session-based, form-encoded):
 *   POST /auth/login  { cid, user, pass }  →  { status: 1, sid }
 *   All subsequent requests include sid as a form field.
 *   POST /auth/logout { sid }  (called after each operation)
 *
 * Document types:
 *   300 = חשבונית מס (tax invoice)
 *   330 = חשבונית זיכוי (credit note)
 *   400 = קבלה (receipt)
 *
 * Session is opened and closed per-call — no in-memory caching (serverless).
 */

import type { DocumentType, ReceiptProvider } from './index'

const ICOUNT_BASE = 'https://api.icount.co.il/api/v3.php'

export interface ICountConfig {
  cid:  string   // Company ID (מזהה חברה)
  user: string   // Username
  pass: string   // Password
}

interface ICountLoginResponse {
  status:   number
  sid?:     string
  error_description?: string
}

interface ICountDocCreateResponse {
  status:    number
  doc_id?:   string
  doc_url?:  string
  error_description?: string
}

async function formPost<T>(endpoint: string, data: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(data).toString()
  const res = await fetch(`${ICOUNT_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`[icount] HTTP ${res.status} on ${endpoint}: ${detail}`)
  }
  return res.json() as Promise<T>
}

export class ICountProvider implements ReceiptProvider {
  constructor(private config: ICountConfig) {}

  private async login(): Promise<string> {
    const login = await formPost<ICountLoginResponse>('auth/login', {
      cid:  this.config.cid,
      user: this.config.user,
      pass: this.config.pass,
    })
    if (!login.status || !login.sid) {
      throw new Error(`[icount] Login failed: ${login.error_description ?? 'unknown error'}`)
    }
    return login.sid
  }

  private async createDocument(
    sid: string,
    doctype: string,
    params: {
      parentName: string
      description: string
      orgName: string
      amount: number
      date: string
      chargeId: string
      vatAmount?: number
      customerTaxId?: string
    }
  ): Promise<{ url: string; id: string }> {
    const docDescription =
      params.orgName.trim().length > 0
        ? `${params.orgName.trim()} — ${params.description}`
        : params.description

    const fields: Record<string, string> = {
      sid,
      doctype,
      lang:            'he',
      client_name:     params.parentName,
      item_name_1:     docDescription,
      item_quantity_1: '1',
      item_price_1:    String(params.amount),
      item_vat_1:      String(params.vatAmount ?? 0),
      doc_date:        params.date.replace(/-/g, ''),
      ref_number:      params.chargeId,
    }

    if (params.customerTaxId) {
      fields.client_taxid = params.customerTaxId
    }

    let docResult: ICountDocCreateResponse
    try {
      docResult = await formPost<ICountDocCreateResponse>('doc/create', fields)
    } finally {
      await formPost<unknown>('auth/logout', { sid }).catch(() => undefined)
    }

    if (!docResult.status || !docResult.doc_id) {
      throw new Error(`[icount] Document creation failed: ${docResult.error_description ?? 'unknown error'}`)
    }

    return {
      url: docResult.doc_url ?? `https://app.icount.co.il/m/doc/${docResult.doc_id}`,
      id:  docResult.doc_id,
    }
  }

  async issueReceipt(params: {
    chargeId:    string
    amount:      number
    parentName:  string
    description: string
    orgName:     string
    date:        string
    documentType?: DocumentType
    vatAmount?:    number
    customerTaxId?: string
  }): Promise<{ receiptUrl: string; receiptId: string; documentType: DocumentType }> {
    const docType = params.documentType ?? 'receipt'
    // 300 = חשבונית מס (tax invoice), 400 = קבלה (receipt)
    const doctype = docType === 'tax_invoice' ? '300' : '400'

    const sid = await this.login()
    const result = await this.createDocument(sid, doctype, params)

    return {
      receiptUrl: result.url,
      receiptId:  result.id,
      documentType: docType,
    }
  }

  async issueCreditNote(params: {
    chargeId: string
    amount: number
    parentName: string
    description: string
    orgName: string
    date: string
    vatAmount: number
    customerTaxId?: string
    originalInvoiceNumber: string
  }): Promise<{ creditNoteUrl: string; creditNoteId: string }> {
    const sid = await this.login()
    const description = `${params.description} (מבטלת חשבונית ${params.originalInvoiceNumber})`
    const result = await this.createDocument(sid, '330', {
      ...params,
      description,
    })
    return { creditNoteUrl: result.url, creditNoteId: result.id }
  }

  /**
   * Validates credentials by attempting a login and immediately logging out.
   * Used by the settings action to test credentials before saving.
   */
  async validateCredentials(): Promise<void> {
    const login = await formPost<ICountLoginResponse>('auth/login', {
      cid:  this.config.cid,
      user: this.config.user,
      pass: this.config.pass,
    })
    if (!login.status || !login.sid) {
      throw new Error(login.error_description ?? 'Login failed')
    }
    await formPost<unknown>('auth/logout', { sid: login.sid }).catch(() => undefined)
  }
}
