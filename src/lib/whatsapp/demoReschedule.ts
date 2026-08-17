/**
 * DEMO-ONLY reschedule intent for the Meta App Review screencast.
 *
 * Gated by DEMO_RESCHEDULE_ENABLED=1 — without the flag every export short-circuits
 * and the webhook dispatch never reaches this path, so it is dead code in normal
 * production operation. A real rescheduling flow is a Sprint 32 candidate
 * (docs/sprint-31-scope.md § Out of scope); this handler intentionally implements
 * the minimal happy path: find the parent's next scheduled lesson within 48h and
 * move it to the requested time on the same day.
 *
 * Not exported from src/lib/whatsapp/index.ts on purpose — the demo surface stays
 * isolated to this file plus an ~8-line dispatch block in the webhook route.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'
import type { AppLocale } from '@/lib/i18n/locale'
import { toLuxonLocale } from '@/lib/i18n/locale'

export function isDemoRescheduleEnabled(): boolean {
  return process.env.DEMO_RESCHEDULE_ENABLED === '1'
}

/**
 * Demo-only copy. Kept local rather than added to src/lib/whatsapp/strings.ts so
 * the demo surface stays confined to this file — the whole thing is deleted once
 * App Review is approved.
 */
const DEMO_STRINGS: Record<AppLocale, Record<string, string>> = {
  he: {
    ask_time: 'לאיזו שעה להזיז את השיעור? אפשר לכתוב למשל: להזיז ל-18:00',
    no_lesson: 'לא מצאתי שיעור מתוכנן ב-48 השעות הקרובות.',
    conflict: 'השעה החדשה מתנגשת עם שיעור אחר של המורה. אפשר לנסות שעה אחרת 🙂',
    failed: 'משהו השתבש ולא הצלחנו לעדכן את השיעור. אפשר לפנות לצוות ונעזור.',
    updated: '✅ השיעור עודכן!',
    with_teacher: 'עם',
    new_time: 'שעה חדשה',
    instead_of: 'במקום',
    the_student: 'התלמיד',
  },
  en: {
    ask_time: 'What time would you like to move the lesson to? For example: reschedule to 18:00',
    no_lesson: 'I could not find a lesson scheduled in the next 48 hours.',
    conflict: 'That time clashes with another lesson for this teacher. Feel free to try another one 🙂',
    failed: 'Something went wrong and we could not update the lesson. Reach out to the team and we will help.',
    updated: '✅ Lesson updated!',
    with_teacher: 'with',
    new_time: 'New time',
    instead_of: 'instead of',
    the_student: 'the student',
  },
}

const demoString = (key: string, locale: AppLocale): string =>
  DEMO_STRINGS[locale][key] ?? DEMO_STRINGS.he[key]

// "להזיז"/"לדחות"/"לשנות (את) השיעור"/"להעביר (את) השיעור", plus the English
// equivalents.
//
// "reschedule" contains "schedule", so it would otherwise be swallowed by
// hasScheduleIntent — safe only because the webhook checks this detector first
// (route.ts § 9, before the schedule branch). Verified against the rest:
// none of these trigger hasCancellationIntent, hasBookingIntent,
// hasBalanceIntent, hasPortalIntent or hasHomeworkDoneIntent.
export function hasRescheduleIntent(text: string): boolean {
  return (
    /להזיז|לדחות|לשנות את השיעור|להעביר את השיעור/.test(text) ||
    /\b(reschedule|postpone)\b/i.test(text) ||
    /\b(move|change|shift)\s+(my\s+|the\s+)?lesson\b/i.test(text)
  )
}

/** First HH:MM occurrence in the message ("ל-18:00", "לשעה 18:30"). */
export function parseTargetTime(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

export async function handleRescheduleIntent(params: {
  parentId: string
  orgId: string
  senderPhone: string
  text: string
  timezone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}): Promise<void> {
  const { parentId, orgId, senderPhone, text, timezone, accessToken, phoneNumberId, locale } = params
  const db = createServiceRoleClient()

  const target = parseTargetTime(text)
  if (!target) {
    await sendTextMessage(senderPhone, demoString('ask_time', locale), accessToken, phoneNumberId)
    return
  }

  // Parent's students
  const { data: relationships } = await db
    .from('relationships')
    .select('student_id')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
  const studentIds = (relationships ?? []).map((r) => r.student_id as string)
  if (studentIds.length === 0) {
    await sendTextMessage(senderPhone, demoString('no_lesson', locale), accessToken, phoneNumberId)
    return
  }

  // Next scheduled lesson within 48h for any of the parent's students
  const nowUtc = DateTime.utc()
  const { data: junctions } = await db
    .from('lesson_students')
    .select(
      'student_id, students ( full_name ), lessons!inner ( id, start_at, end_at, status, teacher_id, teachers ( profiles ( full_name ) ) )'
    )
    .eq('organization_id', orgId)
    .in('student_id', studentIds)
    .eq('lessons.status', 'scheduled')
    .gte('lessons.start_at', nowUtc.toISO())
    .lte('lessons.start_at', nowUtc.plus({ hours: 48 }).toISO())

  type JunctionRow = {
    students: { full_name: string | null } | null
    lessons: {
      id: string
      start_at: string
      end_at: string
      teachers: { profiles: { full_name: string | null } | null } | null
    } | null
  }
  const candidates = ((junctions ?? []) as unknown as JunctionRow[])
    .filter((j) => j.lessons)
    .sort(
      (a, b) =>
        new Date(a.lessons!.start_at).getTime() - new Date(b.lessons!.start_at).getTime()
    )

  const next = candidates[0]
  if (!next?.lessons) {
    await sendTextMessage(senderPhone, demoString('no_lesson', locale), accessToken, phoneNumberId)
    return
  }

  const lesson = next.lessons
  const oldStart = DateTime.fromISO(lesson.start_at, { zone: 'utc' }).setZone(timezone)
  const durationMs = new Date(lesson.end_at).getTime() - new Date(lesson.start_at).getTime()
  const newStart = oldStart.set({
    hour: target.hour,
    minute: target.minute,
    second: 0,
    millisecond: 0,
  })
  const newEnd = newStart.plus({ milliseconds: durationMs })

  const { error: updateError } = await db
    .from('lessons')
    .update({
      start_at: newStart.toUTC().toISO(),
      end_at: newEnd.toUTC().toISO(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lesson.id)
    .eq('organization_id', orgId)

  if (updateError) {
    // 23P01 = no_teacher_lesson_overlap exclusion constraint
    if (updateError.code === '23P01') {
      await sendTextMessage(senderPhone, demoString('conflict', locale), accessToken, phoneNumberId)
      return
    }
    console.error('[whatsapp/demoReschedule] Failed to update lesson', {
      lessonId: lesson.id,
      error: updateError,
    })
    await sendTextMessage(senderPhone, demoString('failed', locale), accessToken, phoneNumberId)
    return
  }

  const studentName = next.students?.full_name ?? demoString('the_student', locale)
  const teacherName = lesson.teachers?.profiles?.full_name
  const dateLabel = newStart
    .setLocale(toLuxonLocale(locale))
    .toFormat(locale === 'he' ? "cccc, d בLLLL" : 'cccc, d LLLL')
  await sendTextMessage(
    senderPhone,
    `${demoString('updated', locale)}\n\n` +
      `${studentName}${teacherName ? ` ${demoString('with_teacher', locale)} ${teacherName}` : ''}\n` +
      `${dateLabel}\n` +
      `${demoString('new_time', locale)}: ${newStart.toFormat('HH:mm')} ` +
      `(${demoString('instead_of', locale)} ${oldStart.toFormat('HH:mm')})`,
    accessToken,
    phoneNumberId
  )

  console.info('[whatsapp/demoReschedule] Lesson rescheduled', {
    orgId,
    lessonId: lesson.id,
    from: lesson.start_at,
    to: newStart.toUTC().toISO(),
  })
}
