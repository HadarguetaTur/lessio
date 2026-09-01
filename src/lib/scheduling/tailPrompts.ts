/**
 * Reading and resolving the "you have leftover time at the end of that day"
 * prompts that `detectDayTail` records.
 *
 * The stored row is a record that the teacher was asked, not a source of truth
 * about the day: a lesson can be cancelled or moved between the question and
 * the answer. So every read re-derives the tail and drops rows whose remainder
 * no longer exists. That is cheaper and more reliable than invalidating the
 * prompt from every path that can change a lesson.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { extendDayWindow, type ExtendDayError } from '@/lib/availability-overrides/extendDayWindow'
import { getOrgLessonDurations } from '@/lib/organizations/lessonDurations'
import { findDayTail } from './dayTail'

export interface TailPrompt {
  id: string
  teacherId: string
  /** YYYY-MM-DD in org timezone */
  date: string
  /** HH:MM in org timezone — the live values, not necessarily the stored ones. */
  start: string
  end: string
  minutes: number
}

export type TailResolveError =
  | ExtendDayError
  | { key: 'promptNotFound' }
  | { key: 'resolveFailed' }

/**
 * Pending prompts still worth answering: today onwards, remainder confirmed.
 * Pass `teacherId` for a teacher's own view; omit it for an owner's.
 */
export async function getPendingTailPrompts(params: {
  orgId: string
  teacherId?: string
  /** Today in org timezone; rows before it are stale by definition. */
  today: string
}): Promise<TailPrompt[]> {
  const { orgId, teacherId, today } = params
  const db = createServiceRoleClient()

  let query = db
    .from('availability_tail_prompts')
    .select('id, teacher_id, tail_date, tail_start, tail_end, tail_minutes')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .gte('tail_date', today)
    .order('tail_date')

  if (teacherId) query = query.eq('teacher_id', teacherId)

  const { data, error } = await query
  if (error || !data?.length) return []

  const live = await Promise.all(
    data.map(async (row) => {
      const tail = await findDayTail({
        orgId,
        teacherId: row.teacher_id as string,
        date: row.tail_date as string,
      })
      if (!tail) return null

      return {
        id: row.id as string,
        teacherId: row.teacher_id as string,
        date: row.tail_date as string,
        start: tail.start,
        end: tail.end,
        minutes: tail.minutes,
      }
    })
  )

  return live.filter((p): p is TailPrompt => p !== null)
}

/**
 * The prompts a page renders: live remainders plus the "extend until" the time
 * picker should open on — far enough to fit the shortest lesson a parent could
 * book, since anything less would leave the same problem behind.
 *
 * One call so a page does not have to know about the org timezone or the
 * duration settings to show a card.
 */
export async function getTailPromptsForPage(params: {
  orgId: string
  teacherId?: string
}): Promise<
  (TailPrompt & { suggestedEnd: string })[]
> {
  const { orgId, teacherId } = params
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .maybeSingle()

  const timezone = (org?.timezone as string) ?? 'Asia/Jerusalem'
  const today = DateTime.now().setZone(timezone).toISODate()!

  const [prompts, durations] = await Promise.all([
    getPendingTailPrompts({ orgId, teacherId, today }),
    getOrgLessonDurations(orgId, 'bot'),
  ])

  const shortest = durations.length > 0 ? Math.min(...durations.map((d) => d.minutes)) : 30

  return prompts.map((p) => ({
    ...p,
    suggestedEnd: addMinutesCapped(p.start, shortest),
  }))
}

/** "HH:MM" plus minutes, never past the end of the day. */
function addMinutesCapped(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Loads a pending prompt, scoped so one teacher cannot answer another's. */
async function loadPending(orgId: string, promptId: string, teacherId?: string) {
  const db = createServiceRoleClient()
  let query = db
    .from('availability_tail_prompts')
    .select('id, teacher_id, tail_date, tail_start, tail_end')
    .eq('id', promptId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')

  if (teacherId) query = query.eq('teacher_id', teacherId)

  const { data } = await query.maybeSingle()
  return data
}

async function markResolved(
  orgId: string,
  promptId: string,
  status: 'dismissed' | 'blocked' | 'extended',
  resolvedBy: string
): Promise<TailResolveError | null> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('availability_tail_prompts')
    .update({
      status,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', promptId)
    .eq('organization_id', orgId)

  return error ? { key: 'resolveFailed' } : null
}

export async function dismissTailPrompt(params: {
  orgId: string
  promptId: string
  resolvedBy: string
  teacherId?: string
}): Promise<TailResolveError | null> {
  const row = await loadPending(params.orgId, params.promptId, params.teacherId)
  if (!row) return { key: 'promptNotFound' }
  return markResolved(params.orgId, params.promptId, 'dismissed', params.resolvedBy)
}

/**
 * Closes the leftover as a one-off blocked range on that date.
 *
 * The range is re-derived rather than taken from the stored row: if a lesson
 * moved since the prompt was raised, blocking the old times would close hours
 * the teacher still has free.
 */
export async function blockTailPrompt(params: {
  orgId: string
  promptId: string
  resolvedBy: string
  teacherId?: string
}): Promise<TailResolveError | null> {
  const row = await loadPending(params.orgId, params.promptId, params.teacherId)
  if (!row) return { key: 'promptNotFound' }

  const tail = await findDayTail({
    orgId: params.orgId,
    teacherId: row.teacher_id as string,
    date: row.tail_date as string,
  })
  // Nothing left to block — the day changed. Retire the question quietly.
  if (!tail) {
    return markResolved(params.orgId, params.promptId, 'dismissed', params.resolvedBy)
  }

  const db = createServiceRoleClient()
  const { error } = await db.from('availability_overrides').insert({
    organization_id: params.orgId,
    teacher_id: row.teacher_id,
    override_date: row.tail_date,
    is_available: false,
    start_time: tail.start,
    end_time: tail.end,
    reason: null,
  })

  if (error) return { key: 'resolveFailed' }

  return markResolved(params.orgId, params.promptId, 'blocked', params.resolvedBy)
}

export async function extendTailPrompt(params: {
  orgId: string
  promptId: string
  newEndTime: string
  resolvedBy: string
  teacherId?: string
}): Promise<TailResolveError | null> {
  const row = await loadPending(params.orgId, params.promptId, params.teacherId)
  if (!row) return { key: 'promptNotFound' }

  const failure = await extendDayWindow({
    orgId: params.orgId,
    teacherId: row.teacher_id as string,
    date: row.tail_date as string,
    newEndTime: params.newEndTime,
  })
  if (failure) return failure

  return markResolved(params.orgId, params.promptId, 'extended', params.resolvedBy)
}
