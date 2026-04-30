/**
 * Payment request email template — Sprint 25 Story 3b.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  amount: string
  description: string
  paymentLink: string
}

export function paymentRequestEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  if (locale === 'en') {
    return {
      subject: `Payment Request — ₪${vars.amount}`,
      html: wrapEmailHtml(`
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Payment Request</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>Amount:</strong> ₪${vars.amount}</p>
        <p style="margin:0 0 16px;color:#374151;font-size:14px;"><strong>Description:</strong> ${vars.description}</p>
        <a href="${vars.paymentLink}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
          Pay Now
        </a>
      `, locale),
    }
  }

  return {
    subject: `בקשת תשלום — ₪${vars.amount}`,
    html: wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">בקשת תשלום</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>סכום:</strong> ₪${vars.amount}</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;"><strong>תיאור:</strong> ${vars.description}</p>
      <a href="${vars.paymentLink}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
        לתשלום
      </a>
    `, locale),
  }
}
