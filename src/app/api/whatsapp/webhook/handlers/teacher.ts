/**
 * Inbound handling for a teacher writing to the business number.
 *
 * Before this existed, a teacher got "this number is not registered with us
 * yet" and was filed as a sales lead in their own org's CRM.
 *
 * Still read-only where it counts: attendance and cancellations stay in the
 * dashboard, because WhatsApp has no real confirmation step and a mistyped
 * reply here would move a parent's charge. The one exception is the day-off
 * request, and it is not really a write — it files a request that does nothing
 * until an owner approves it.
 *
 * The date picker is state-free like the rest of the menu: each step carries
 * the dates chosen so far inside the reply payload (see dayOffPayloads), so a
 * teacher can walk away mid-pick and their next tap still resolves.
 */

import { DateTime } from 'luxon'
import { hasScheduleIntent } from '@/lib/whatsapp'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { sendListMessage, sendReplyButtons } from '@/lib/whatsapp/interactive'
import { toLuxonLocale, type AppLocale } from '@/lib/i18n/locale'
import { botString } from '@/lib/whatsapp/strings'
import {
  DAY_PAGE_SIZE,
  MAX_DAY_OFF_DAYS,
  decodeDayOffPayload,
  encodeDayOffPayload,
  formatDateRange,
  type DayOffPayload,
} from '@/lib/whatsapp/dayOffPayloads'
import {
  countLessonsInRange,
  createDayOffRequest,
  notifyStaffOfRequest,
  type SendContext,
} from '@/lib/day-off'
import { replyWith, type HandlerContext } from '../shared'

/** How far ahead the teacher's schedule reply reaches. */
const SCHEDULE_DAYS = 7

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

  // A step in the date picker. Decoded before the menu actions because these
  // payloads are not menu actions at all — they reach here with menuAction null.
  const pick = decodeDayOffPayload(ctx.msg.replyId, ctx.timezone)
  if (pick) {
    await handleDayOffStep(ctx, pick)
    return true
  }

  // A `d:` payload that failed to decode is a stale or mangled tap — a list
  // sent last week whose dates have since passed. Say so rather than dropping
  // it into keyword handling, where it would read as an unknown message.
  if (!menuAction && ctx.msg.replyId?.startsWith('d:')) {
    await replyWith(ctx, 'day_off_invalid')
    return true
  }

  if (menuAction === 'day_off') {
    await sendStartDateList(ctx, 0)
    return true
  }

  if (menuAction === 'dashboard') {
    await replyWith(ctx, 'teacher_dashboard_link', { url: `${ctx.origin}/teacher/schedule` })
    return true
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

// ── Day-off request ───────────────────────────────────────────────────────────

async function handleDayOffStep(ctx: HandlerContext, pick: DayOffPayload): Promise<void> {
  switch (pick.step) {
    case 'pick':
      await sendStartDateList(ctx, pick.offset)
      return
    case 'start':
      await sendEndDateList(ctx, pick.startDate, 0)
      return
    case 'endpick':
      await sendEndDateList(ctx, pick.startDate, pick.offset)
      return
    case 'end':
      await sendConfirmation(ctx, pick.startDate, pick.endDate)
      return
    case 'confirm':
      await submitRequest(ctx, pick.startDate, pick.endDate)
      return
    case 'abort':
      await replyWith(ctx, 'day_off_aborted')
      return
  }
}

/** "יום שני 18/08" — the label on a date row. */
function dayLabel(date: DateTime, locale: AppLocale): string {
  return `${date.toFormat('EEEE', { locale: toLuxonLocale(locale) })} ${date.toFormat('dd/MM')}`
}

function today(ctx: HandlerContext): DateTime {
  return DateTime.now().setZone(ctx.timezone).startOf('day')
}

async function sendStartDateList(ctx: HandlerContext, offset: number): Promise<void> {
  const first = today(ctx).plus({ days: offset })

  const rows = Array.from({ length: DAY_PAGE_SIZE }, (_, i) => {
    const date = first.plus({ days: i })
    return {
      id: encodeDayOffPayload({ step: 'start', startDate: date.toFormat('yyyy-MM-dd') }),
      title: dayLabel(date, ctx.locale),
    }
  })

  rows.push({
    id: encodeDayOffPayload({ step: 'pick', offset: offset + DAY_PAGE_SIZE }),
    title: botString('day_off_more_days', ctx.locale),
  })
  rows.push({
    id: encodeDayOffPayload({ step: 'abort' }),
    title: botString('day_off_abort_row', ctx.locale),
  })

  await sendListMessage(
    ctx.senderPhone,
    {
      body: botString('day_off_pick_start_body', ctx.locale),
      buttonLabel: botString('day_off_pick_start_button', ctx.locale),
      rows,
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

/**
 * The "until when?" list. Rows are anchored to the chosen start date, and the
 * paging offset walks forward from it — never past the 14-day cap, so a teacher
 * cannot page their way to a range the database would reject.
 */
async function sendEndDateList(
  ctx: HandlerContext,
  startDate: string,
  offset: number
): Promise<void> {
  const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: ctx.timezone })
  const startLabel = start.toFormat('dd/MM')

  const rows: Array<{ id: string; title: string; description?: string }> = []

  if (offset === 0) {
    rows.push({
      id: encodeDayOffPayload({ step: 'end', startDate, endDate: startDate }),
      title: botString('day_off_single_day', ctx.locale),
      description: botString('day_off_single_day_desc', ctx.locale, { start_date: startLabel }),
    })
  }

  // Day 0 is the start date itself, already offered as "just one day".
  for (let i = 1; i <= DAY_PAGE_SIZE; i++) {
    const dayNumber = offset + i
    if (dayNumber > MAX_DAY_OFF_DAYS - 1) break
    const date = start.plus({ days: dayNumber })
    rows.push({
      id: encodeDayOffPayload({ step: 'end', startDate, endDate: date.toFormat('yyyy-MM-dd') }),
      title: dayLabel(date, ctx.locale),
    })
  }

  const nextOffset = offset + DAY_PAGE_SIZE
  if (nextOffset <= MAX_DAY_OFF_DAYS - 1) {
    rows.push({
      id: encodeDayOffPayload({ step: 'endpick', startDate, offset: nextOffset }),
      title: botString('day_off_more_days', ctx.locale),
      description: botString('day_off_more_days_desc', ctx.locale),
    })
  }

  rows.push({
    id: encodeDayOffPayload({ step: 'abort' }),
    title: botString('day_off_abort_row', ctx.locale),
  })

  await sendListMessage(
    ctx.senderPhone,
    {
      body: botString('day_off_pick_end_body', ctx.locale, { start_date: startLabel }),
      buttonLabel: botString('day_off_pick_end_button', ctx.locale),
      rows,
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

async function sendConfirmation(
  ctx: HandlerContext,
  startDate: string,
  endDate: string
): Promise<void> {
  await sendReplyButtons(
    ctx.senderPhone,
    {
      body: botString('day_off_confirm_body', ctx.locale, {
        date_range: formatDateRange(startDate, endDate, ctx.timezone),
      }),
      buttons: [
        {
          id: encodeDayOffPayload({ step: 'confirm', startDate, endDate }),
          title: botString('day_off_confirm_button', ctx.locale),
        },
        {
          id: encodeDayOffPayload({ step: 'abort' }),
          title: botString('day_off_cancel_button', ctx.locale),
        },
      ],
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

async function submitRequest(
  ctx: HandlerContext,
  startDate: string,
  endDate: string
): Promise<void> {
  if (ctx.sender.role !== 'teacher') return

  const dateRange = formatDateRange(startDate, endDate, ctx.timezone)

  const result = await createDayOffRequest({
    orgId: ctx.org.id,
    teacherId: ctx.sender.teacherId,
    startDate,
    endDate,
  })

  if (!result.ok) {
    await replyWith(ctx, 'day_off_already_pending')
    return
  }

  await replyWith(ctx, 'day_off_submitted', { date_range: dateRange })

  const sendCtx: SendContext = {
    orgId: ctx.org.id,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    timezone: ctx.timezone,
  }

  // The owner is told how much is at stake before they decide, so approving is
  // not a blind tap.
  const lessons = await countLessonsInRange(
    ctx.org.id,
    ctx.sender.teacherId,
    startDate,
    endDate,
    ctx.timezone
  )

  // The teacher already has their confirmation; a failure to reach the owners
  // must not turn into an error reply for them.
  await notifyStaffOfRequest(result.request, sendCtx, lessons).catch((err) => {
    console.error('[whatsapp/webhook] Could not alert staff of a day-off request', {
      orgId: ctx.org.id,
      requestId: result.request.id,
      err,
    })
  })

  console.info('[whatsapp/webhook] Day-off request filed', {
    orgId: ctx.org.id,
    teacherId: ctx.sender.teacherId,
    startDate,
    endDate,
    lessons,
  })
}

// ── Schedule and students ─────────────────────────────────────────────────────

/** The teacher's own lessons from now through the end of the coming week. */
async function sendTeacherSchedule(ctx: HandlerContext, teacherId: string): Promise<void> {
  const now = DateTime.now().setZone(ctx.timezone)
  const until = now.plus({ days: SCHEDULE_DAYS }).endOf('day')

  const { data, error } = await ctx.db
    .from('lessons')
    .select('start_at, lesson_students ( students ( full_name ) )')
    .eq('organization_id', ctx.org.id)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', now.toUTC().toISO()!)
    .lte('start_at', until.toUTC().toISO()!)
    .order('start_at', { ascending: true })
    .limit(20)

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
      return `\n• ${botString('student_line_with_homework', ctx.locale, { name, open: String(open) })}`
    })
    .join('')

  await replyWith(ctx, 'teacher_students_body', { student_lines: lines })

  console.info('[whatsapp/webhook] Teacher students replied', {
    orgId: ctx.org.id,
    teacherId,
    students: rows.length,
  })
}
