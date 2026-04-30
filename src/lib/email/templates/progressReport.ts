/**
 * Progress report email — PDF attached; body summarizes period stats.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  orgName: string
  studentName: string
  periodLabel: string
  attendanceSummary: string
  homeworkSummary: string
}

export function progressReportEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  if (locale === 'en') {
    return {
      subject: `Progress report — ${vars.studentName} (${vars.periodLabel})`,
      html: wrapEmailHtml(
        `
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Progress report</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.orgName}</strong></p>
        <p style="margin:0 0 16px;color:#374151;font-size:14px;">Student: <strong>${vars.studentName}</strong><br/>
        Period: <strong>${vars.periodLabel}</strong></p>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;">${vars.attendanceSummary}</p>
        <p style="margin:0 0 16px;color:#374151;font-size:14px;">${vars.homeworkSummary}</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">The detailed report is attached as a PDF.</p>
        `,
        locale
      ),
    }
  }

  return {
    subject: `דוח התקדמות — ${vars.studentName} (${vars.periodLabel})`,
    html: wrapEmailHtml(
      `
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">דוח התקדמות</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;"><strong>${vars.orgName}</strong></p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">תלמיד/ה: <strong>${vars.studentName}</strong><br/>
      תקופה: <strong>${vars.periodLabel}</strong></p>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">${vars.attendanceSummary}</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;">${vars.homeworkSummary}</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">הדוח המלא מצורף כקובץ PDF.</p>
      `,
      locale
    ),
  }
}
