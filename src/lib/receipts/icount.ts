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
 * Receipt document type: 400 (קבלה)
 * Session is opened and closed per-call — no in-memory caching (serverless).
 */

import type { ReceiptProvider } from './index'

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

  async issueReceipt(params: {
    chargeId:   string
    amount:     number
    parentName: string
    description: string
    orgName:    string
    date:       string
  }): Promise<{ receiptUrl: string; receiptId: string }> {
    const { chargeId, amount, parentName, description, orgName, date } = params

    // ── 1. Login → obtain session ID ─────────────────────────────────────────
    const login = await formPost<ICountLoginResponse>('auth/login', {
      cid:  this.config.cid,
      user: this.config.user,
      pass: this.config.pass,
    })

    if (!login.status || !login.sid) {
      throw new Error(
        `[icount] Login failed: ${login.error_description ?? 'unknown error'}`
      )
    }

    const sid = login.sid

    const docDescription =
      orgName.trim().length > 0 ? `${orgName.trim()} — ${description}` : description

    // ── 2. Create receipt document (doctype 400 = קבלה) ──────────────────────
    let docResult: ICountDocCreateResponse
    try {
      docResult = await formPost<ICountDocCreateResponse>('doc/create', {
        sid,
        doctype:        '400',
        lang:           'he',
        client_name:    parentName,
        item_name_1:    docDescription,
        item_quantity_1: '1',
        item_price_1:   String(amount),
        item_vat_1:     '0',
        doc_date:       date.replace(/-/g, ''),   // YYYYMMDD
        ref_number:     chargeId,
      })
    } finally {
      // ── 3. Always logout to release server-side session ───────────────────
      await formPost<unknown>('auth/logout', { sid }).catch(() => undefined)
    }

    if (!docResult.status || !docResult.doc_id) {
      throw new Error(
        `[icount] Document creation failed: ${docResult.error_description ?? 'unknown error'}`
      )
    }

    const receiptUrl =
      docResult.doc_url ??
      `https://app.icount.co.il/m/doc/${docResult.doc_id}`

    return {
      receiptUrl,
      receiptId: docResult.doc_id,
    }
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
