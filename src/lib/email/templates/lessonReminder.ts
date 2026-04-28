/**
 * Lesson reminder email template — Sprint 25 Story 3b.
 */

import { wrapEmailHtml } from './base'

interface Vars {
  teacherName: string
  date: string
  time: string
  studentName?: string
}

export function lessonReminderEmail(
  vars: Vars,
  locale: 'he' | 'en' = 'he'
): { subject: string; html: string } {
  if (locale === 'en') {
    return {
      subject: `Lesson Reminder — ${vars.date} at ${vars.time}`,
      html: wrapEmailHtml(`
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Lesson Reminder</h2>
        <p style="margin:0 0 8px;color:#374151;font-size:14px;">
          ${vars.studentName ? `${vars.studentName} has ` : 'You have '}a lesson with <strong>${vars.teacherName}</strong>
        </p>
        <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Date:</strong> ${vars.date}</p>
        <p style="margin:0;color:#374151;font-size:14px;"><strong>Time:</strong> ${vars.time}</p>
      `, locale),
    }
  }

  return {
    subject: `תזכורת שיעור — ${vars.date} בשעה ${vars.time}`,
    html: wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">תזכורת שיעור</h2>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">
        ${vars.studentName ? `ל${vars.studentName} ` : ''}שיעור עם <strong>${vars.teacherName}</strong>
      </p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>תאריך:</strong> ${vars.date}</p>
      <p style="margin:0;color:#374151;font-size:14px;"><strong>שעה:</strong> ${vars.time}</p>
    `, locale),
  }
}
