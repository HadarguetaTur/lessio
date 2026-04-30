/**
 * Homework assignment email template — Sprint 25 Story 3b.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  title: string
  body: string
  dueDate?: string
}

export function homeworkAssignmentEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  const dueLine = vars.dueDate
    ? locale === 'en' ? `<p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>Due:</strong> ${vars.dueDate}</p>` : `<p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>תאריך הגשה:</strong> ${vars.dueDate}</p>`
    : ''

  if (locale === 'en') {
    return {
      subject: `New Homework — ${vars.title}`,
      html: wrapEmailHtml(`
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">New Homework</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.title}</strong></p>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;">${vars.body}</p>
        ${dueLine}
      `, locale),
    }
  }

  return {
    subject: `שיעורי בית חדשים — ${vars.title}`,
    html: wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">שיעורי בית חדשים</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.title}</strong></p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">${vars.body}</p>
      ${dueLine}
    `, locale),
  }
}
