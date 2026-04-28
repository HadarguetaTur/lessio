/**
 * Homework graded email template — Sprint 25 Story 3b.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  title: string
  score: string
  feedback?: string
}

export function homeworkGradedEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  const feedbackLine = vars.feedback
    ? `<p style="margin:16px 0 0;color:#374151;font-size:14px;"><strong>${locale === 'en' ? 'Feedback' : 'משוב'}:</strong> ${vars.feedback}</p>`
    : ''

  if (locale === 'en') {
    return {
      subject: `Homework Graded — ${vars.title}`,
      html: wrapEmailHtml(`
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Homework Graded</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.title}</strong></p>
        <p style="margin:0;color:#374151;font-size:14px;"><strong>Score:</strong> ${vars.score}/100</p>
        ${feedbackLine}
      `, locale),
    }
  }

  return {
    subject: `ציון שיעורי בית — ${vars.title}`,
    html: wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">שיעורי בית קיבלו ציון</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.title}</strong></p>
      <p style="margin:0;color:#374151;font-size:14px;"><strong>ציון:</strong> ${vars.score}/100</p>
      ${feedbackLine}
    `, locale),
  }
}
