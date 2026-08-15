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

export function isDemoRescheduleEnabled(): boolean {
  return process.env.DEMO_RESCHEDULE_ENABLED === '1'
}

// "להזיז"/"לדחות"/"לשנות (את) השיעור"/"להעביר (את) השיעור".
// Verified against the existing detectors: none of these words trigger
// hasScheduleIntent (שיעורים/לוז/…), hasCancellationIntent, hasBookingIntent,
// hasBalanceIntent, hasPortalIntent or hasHomeworkDoneIntent.
export function hasRescheduleIntent(text: string): boolean {
  return /להזיז|לדחות|לשנות את השיעור|להעביר את השיעור/.test(text)
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
}): Promise<void> {
  const { parentId, orgId, senderPhone, text, timezone, accessToken, phoneNumberId } = params
  const db = createServiceRoleClient()

  const target = parseTargetTime(text)
  if (!target) {
    await sendTextMessage(
      senderPhone,
      'לאיזו שעה להזיז? נא לציין שעה, למשל: להזיז ל-18:00',
      accessToken,
      phoneNumberId
    )
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
    await sendTextMessage(
      senderPhone,
      'לא נמצא שיעור מתוכנן ב-48 השעות הקרובות.',
      accessToken,
      phoneNumberId
    )
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
    await sendTextMessage(
      senderPhone,
      'לא נמצא שיעור מתוכנן ב-48 השעות הקרובות.',
      accessToken,
      phoneNumberId
    )
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
      await sendTextMessage(
        senderPhone,
        'השעה החדשה מתנגשת עם שיעור אחר של המורה. נסו שעה אחרת.',
        accessToken,
        phoneNumberId
      )
      return
    }
    console.error('[whatsapp/demoReschedule] Failed to update lesson', {
      lessonId: lesson.id,
      error: updateError,
    })
    await sendTextMessage(
      senderPhone,
      'לא הצלחנו לעדכן את השיעור. אנא פנו לצוות.',
      accessToken,
      phoneNumberId
    )
    return
  }

  const studentName = next.students?.full_name ?? 'התלמיד/ה'
  const teacherName = lesson.teachers?.profiles?.full_name
  const dateLabel = newStart.setLocale('he').toFormat("cccc, d בLLLL")
  await sendTextMessage(
    senderPhone,
    `✅ השיעור עודכן!\n` +
      `${studentName}${teacherName ? ` עם ${teacherName}` : ''}\n` +
      `${dateLabel}\n` +
      `שעה: ${oldStart.toFormat('HH:mm')} ← ${newStart.toFormat('HH:mm')}`,
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
