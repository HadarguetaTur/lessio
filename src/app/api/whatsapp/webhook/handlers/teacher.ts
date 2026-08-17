/**
 * Inbound handling for a teacher writing to the business number.
 *
 * Before this existed, a teacher got "this number is not registered with us
 * yet" and was filed as a sales lead in their own org's CRM.
 *
 * Read-only by design. WhatsApp has no real confirmation step, and a mistyped
 * reply on a write path here would move a parent's charge — attendance and
 * cancellations stay in the dashboard.
 */

import { DateTime } from 'luxon'
import { hasScheduleIntent } from '@/lib/whatsapp'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { toLuxonLocale } from '@/lib/i18n/locale'
import { botString } from '@/lib/whatsapp/strings'
import { replyWith, type HandlerContext } from '../shared'

/** Routes a message from a teacher. Returns true when it was handled. */
export async function handleTeacherMessage(
  ctx: HandlerContext,
  menuAction: MenuAction | null
): Promise<boolean> {
  if (ctx.sender.role !== 'teacher') return false

  if (menuAction && !isActionAllowedForRole(menuAction, 'teacher')) {
    await replyWith(ctx, 'action_not_for_role')
    return false
  }

  if (menuAction === 'my_schedule' || (!menuAction && hasScheduleIntent(ctx.msg.text))) {
    await sendTeacherSchedule(ctx, ctx.sender.teacherId)
    return true
  }

  if (menuAction === 'my_students') {
    await sendTeacherStudents(ctx, ctx.sender.teacherId)
    return true
  }

  return false
}

/** The teacher's own lessons from now through end of tomorrow. */
async function sendTeacherSchedule(ctx: HandlerContext, teacherId: string): Promise<void> {
  const now = DateTime.now().setZone(ctx.timezone)
  const until = now.plus({ days: 1 }).endOf('day')

  const { data, error } = await ctx.db
    .from('lessons')
    .select('start_at, lesson_students ( students ( full_name ) )')
    .eq('organization_id', ctx.org.id)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', now.toUTC().toISO()!)
    .lte('start_at', until.toUTC().toISO()!)
    .order('start_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[whatsapp/webhook] Teacher schedule DB error', { orgId: ctx.org.id, error })
    throw new Error('Failed to load teacher schedule')
  }

  type Row = {
    start_at: string
    lesson_students: Array<{ students: { full_name: string | null } | null }> | null
  }

  const rows = (data ?? []) as unknown as Row[]

  if (rows.length === 0) {
    await replyWith(ctx, 'teacher_no_lessons')
    return
  }

  const dateFormat = ctx.locale === 'he' ? 'EEEE d/MM' : 'EEEE d/MM'
  const lines = rows
    .map((r) => {
      const dt = DateTime.fromISO(r.start_at, { zone: 'utc' }).setZone(ctx.timezone)
      const names = (r.lesson_students ?? [])
        .map((ls) => ls.students?.full_name)
        .filter((n): n is string => Boolean(n))
      const who = names.length > 0 ? names.join(', ') : botString('the_student', ctx.locale)
      const when = `${dt.toFormat(dateFormat, { locale: toLuxonLocale(ctx.locale) })} ${dt.toFormat('HH:mm')}`
      return `\n• ${when} — ${who}`
    })
    .join('')

  await replyWith(ctx, 'teacher_schedule_body', { lesson_lines: lines })

  console.info('[whatsapp/webhook] Teacher schedule replied', {
    orgId: ctx.org.id,
    teacherId,
    lessons: rows.length,
  })
}

/** The teacher's active students, with a count of open homework each. */
async function sendTeacherStudents(ctx: HandlerContext, teacherId: string): Promise<void> {
  const { data: students, error } = await ctx.db
    .from('students')
    .select('id, full_name')
    .eq('organization_id', ctx.org.id)
    .eq('teacher_id', teacherId)
    .eq('is_active', true)
    .order('full_name', { ascending: true })
    .limit(20)

  if (error) {
    console.error('[whatsapp/webhook] Teacher students DB error', { orgId: ctx.org.id, error })
    throw new Error('Failed to load teacher students')
  }

  type StudentRow = { id: string; full_name: string | null }
  const rows = (students ?? []) as StudentRow[]

  if (rows.length === 0) {
    await replyWith(ctx, 'teacher_no_students')
    return
  }

  // One query for all of them rather than one per student.
  const { data: openHw } = await ctx.db
    .from('homework_assignments')
    .select('student_id')
    .eq('organization_id', ctx.org.id)
    .eq('status', 'pending')
    .in(
      'student_id',
      rows.map((s) => s.id)
    )

  const openByStudent = new Map<string, number>()
  for (const row of (openHw ?? []) as Array<{ student_id: string }>) {
    openByStudent.set(row.student_id, (openByStudent.get(row.student_id) ?? 0) + 1)
  }

  const lines = rows
    .map((s) => {
      const name = s.full_name?.trim() || botString('the_student', ctx.locale)
      const open = openByStudent.get(s.id) ?? 0
      if (open === 0) return `\n• ${name}`
      return ctx.locale === 'he'
        ? `\n• ${name} — ${open} שיעורי בית פתוחים`
        : `\n• ${name} — ${open} open homework`
    })
    .join('')

  await replyWith(ctx, 'teacher_students_body', { student_lines: lines })

  console.info('[whatsapp/webhook] Teacher students replied', {
    orgId: ctx.org.id,
    teacherId,
    students: rows.length,
  })
}
