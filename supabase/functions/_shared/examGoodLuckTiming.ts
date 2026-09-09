/**
 * When the good-luck message for an exam is due.
 *
 * SYNC: mirrors src/lib/exams/goodLuckTiming.ts, which carries the reasoning and
 * the unit tests (Deno modules are not covered by vitest). Update both together.
 */

export type GoodLuckTimingInput = {
  /** Current org-local hour, 0–23. */
  nowHour: number
  /** Exam start time as "HH:MM" (or "HH:MM:SS" from Postgres `time`), or null. */
  examTime: string | null
  morningHour: number
  hoursBefore: number
}

export function targetHour(input: Omit<GoodLuckTimingInput, 'nowHour'>): number {
  const { examTime, morningHour, hoursBefore } = input
  const examHour = parseHour(examTime)
  if (examHour === null) return morningHour
  return Math.max(morningHour, examHour - hoursBefore)
}

export function isGoodLuckDue(input: GoodLuckTimingInput): boolean {
  const { nowHour, examTime } = input
  const target = targetHour(input)
  if (nowHour < target) return false

  const examHour = parseHour(examTime)
  if (examHour !== null && nowHour >= examHour) return false

  return true
}

function parseHour(examTime: string | null): number | null {
  if (!examTime) return null
  const m = examTime.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hour = Number(m[1])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  return hour
}
