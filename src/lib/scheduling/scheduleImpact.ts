import { DateTime } from 'luxon'
import { resolveDayWindows } from '@/lib/availability/resolveDayWindows'
import { getOrgLessonDurations, type LessonDurationAudience } from '@/lib/organizations/lessonDurations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveBreakMinutes } from './breaks'

export interface ScheduleFragment {
  start: string
  end: string
  minutes: number
}

export interface ScheduleImpact {
  fragments: ScheduleFragment[]
  suggestions: string[]
}

type BusyRange = { start: number; end: number }

const toMinutes = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Pure calculation kept separate so the packing rules can be tested cheaply. */
export function analyzeFreeSegment(params: {
  windowStart: string
  windowEnd: string
  proposedStart: string
  durationMinutes: number
  breakMinutes: number
  shortestDuration: number
  busy: BusyRange[]
}): ScheduleImpact | null {
  const windowStart = toMinutes(params.windowStart)
  const windowEnd = toMinutes(params.windowEnd)
  const proposedStart = toMinutes(params.proposedStart)
  const proposedEnd = proposedStart + params.durationMinutes
  if (proposedStart < windowStart || proposedEnd > windowEnd) return null

  const busy = params.busy
    .map((range) => ({
      start: Math.max(windowStart, range.start - params.breakMinutes),
      end: Math.min(windowEnd, range.end + params.breakMinutes),
    }))
    .filter((range) => range.end > windowStart && range.start < windowEnd)
    .sort((a, b) => a.start - b.start)

  // The hard overlap check owns genuinely occupied proposals. Do not offer
  // packing advice for a time that cannot be saved in the first place.
  if (busy.some((range) => proposedStart < range.end && proposedEnd > range.start)) return null

  let segmentStart = windowStart
  let segmentEnd = windowEnd
  for (const range of busy) {
    if (range.end <= proposedStart) segmentStart = Math.max(segmentStart, range.end)
    if (range.start >= proposedEnd) {
      segmentEnd = Math.min(segmentEnd, range.start)
      break
    }
  }

  const leftEnd = Math.max(segmentStart, proposedStart - params.breakMinutes)
  const rightStart = Math.min(segmentEnd, proposedEnd + params.breakMinutes)
  const candidates = [
    { start: segmentStart, end: leftEnd },
    { start: rightStart, end: segmentEnd },
  ]
  const fragments = candidates
    .map((range) => ({ ...range, minutes: range.end - range.start }))
    .filter((range) => range.minutes > 0 && range.minutes < params.shortestDuration)
    .map((range) => ({ start: toTime(range.start), end: toTime(range.end), minutes: range.minutes }))

  if (fragments.length === 0) return null

  // Pack against either edge of the free segment. The segment already includes
  // the required distance from neighbouring lessons; window edges need no break.
  const suggestions = [segmentStart, segmentEnd - params.durationMinutes]
    .filter((start) => start >= windowStart && start + params.durationMinutes <= windowEnd)
    .filter((start) => start !== proposedStart)
    .filter((start, index, all) => all.indexOf(start) === index)
    .map(toTime)

  return { fragments, suggestions }
}

/** Analyze whether a manual lesson strands time too short for any allowed lesson. */
export async function analyzeScheduleImpact(params: {
  orgId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
  audience: LessonDurationAudience
}): Promise<ScheduleImpact | null> {
  const { orgId, teacherId, date, startTime, durationMinutes, audience } = params
  const db = createServiceRoleClient()
  const { data: org } = await db.from('organizations').select('timezone').eq('id', orgId).single()
  if (!org) return null
  const timezone = (org.timezone as string) ?? 'Asia/Jerusalem'

  const [day, durations, { breakMinutes }] = await Promise.all([
    resolveDayWindows({ orgId, teacherId, date, timezone }),
    getOrgLessonDurations(orgId, audience),
    getEffectiveBreakMinutes(orgId, teacherId),
  ])
  if (day.fullDayBlocked || durations.length === 0) return null

  const proposedStart = toMinutes(startTime)
  const proposedEnd = proposedStart + durationMinutes
  const window = day.windows.find(
    (item) => proposedStart >= toMinutes(item.start) && proposedEnd <= toMinutes(item.end)
  )
  if (!window) return null

  const localDate = DateTime.fromISO(date, { zone: timezone })
  const { data: lessons } = await db
    .from('lessons')
    .select('start_at, end_at')
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', localDate.startOf('day').toUTC().toISO()!)
    .lte('start_at', localDate.endOf('day').toUTC().toISO()!)

  const busy = (lessons ?? []).map((lesson) => ({
    start: toMinutes(DateTime.fromISO(lesson.start_at, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm')),
    end: toMinutes(DateTime.fromISO(lesson.end_at, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm')),
  }))

  return analyzeFreeSegment({
    windowStart: window.start,
    windowEnd: window.end,
    proposedStart: startTime,
    durationMinutes,
    breakMinutes,
    shortestDuration: Math.min(...durations.map((item) => item.minutes)),
    busy,
  })
}
