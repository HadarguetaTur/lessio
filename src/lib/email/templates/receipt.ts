/**
 * Receipt notification email template — Sprint 25 Story 3b.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  amount: string
  receiptUrl: string
}

export function receiptEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  if (locale === 'en') {
    return {
      subject: `Receipt — ₪${vars.amount}`,
      html: wrapEmailHtml(`
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Payment Receipt</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>Amount:</strong> ₪${vars.amount}</p>
        <a href="${vars.receiptUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
          View Receipt
        </a>
      `, locale),
    }
  }

  return {
    subject: `קבלה — ₪${vars.amount}`,
    html: wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">קבלה על תשלום</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>סכום:</strong> ₪${vars.amount}</p>
      <a href="${vars.receiptUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
        צפה בקבלה
      </a>
    `, locale),
  }
}
