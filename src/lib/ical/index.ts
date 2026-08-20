/**
 * RFC 5545 iCal file generator.
 * Per /docs/sprint-16-scope.md § Story 4.
 *
 * No external libraries — hand-built to avoid dependency bloat.
 * Spec compliance:
 *   - PRODID: -//LESSIO//LESSIO Calendar//HE
 *   - VERSION: 2.0
 *   - CALNAME: "<teacherName> — <orgName>"
 *   - Each lesson → VEVENT with UID, DTSTART, DTEND, SUMMARY, DESCRIPTION
 *   - Line folding at 75 octets (RFC 5545 §3.1)
 *   - CRLF line endings
 */

import { botString } from '@/lib/whatsapp/strings'
import type { AppLocale } from '@/lib/i18n/locale'

export interface ICalLesson {
  id: string
  startAt: string
  endAt: string
  teacherName: string
  studentNames: string[]
  orgName: string
  timezone: string
}

/**
 * Formats a UTC ISO string as a compact iCal datetime: YYYYMMDDTHHmmssZ
 */
function formatICalDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/**
 * Escapes special characters for iCal TEXT values.
 * RFC 5545 §3.3.11: commas, semicolons, and backslashes must be escaped.
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

/**
 * Folds long content lines at 75 octets per RFC 5545 §3.1.
 * Continuation lines begin with a single SPACE character.
 */
function foldLine(line: string): string {
  const MAX = 75
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= MAX) return line

  const result: string[] = []
  let offset = 0

  while (offset < bytes.length) {
    const chunk = bytes.slice(offset, offset + (offset === 0 ? MAX : MAX - 1))
    const str = new TextDecoder().decode(chunk)
    result.push(offset === 0 ? str : ' ' + str)
    offset += chunk.length
  }

  return result.join('\r\n')
}

/**
 * Returns a valid .ics string for the given lessons.
 */
export function generateICalString(
  teacherName: string,
  orgName: string,
  lessons: ICalLesson[],
  /** Language of the event text, as seen in the subscriber's calendar app. */
  locale: AppLocale = 'he'
): string {
  const CRLF = '\r\n'
  // RFC 5545 requires DTSTAMP on every VEVENT; some clients treat a missing
  // DTSTAMP as "event changed" on every refresh and re-fire past alarms.
  const dtstamp = formatICalDate(new Date().toISOString())
  const calName = escapeICalText(`${teacherName} — ${orgName}`)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//LESSIO//LESSIO Calendar//${locale.toUpperCase()}`,
    foldLine(`X-WR-CALNAME:${calName}`),
    'X-WR-TIMEZONE:UTC',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const lesson of lessons) {
    const summary = escapeICalText(
      botString('ics_lesson_summary', locale, { students: lesson.studentNames.join(', ') })
    )
    const description = escapeICalText(
      botString('ics_teacher_line', locale, { teacher: lesson.teacherName })
    )
    const organizer = escapeICalText(orgName)

    lines.push(
      'BEGIN:VEVENT',
      foldLine(`UID:${lesson.id}@lessio`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatICalDate(lesson.startAt)}`,
      `DTEND:${formatICalDate(lesson.endAt)}`,
      foldLine(`SUMMARY:${summary}`),
      foldLine(`DESCRIPTION:${description}`),
      foldLine(`ORGANIZER;CN=${organizer}:MAILTO:support@getlessio.com`),
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')

  return lines.join(CRLF) + CRLF
}
