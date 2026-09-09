/**
 * When the good-luck message for an exam is due.
 *
 * The cron runs hourly, so the answer is per whole org-local hour on the day of
 * the exam. Two shapes:
 *
 *   - The exam has no time (the common case — `exam_date` is a date column and
 *     the time is optional everywhere it is entered). The message goes out at
 *     the org's morning hour.
 *   - The exam has a time. The message goes out `hoursBefore` hours earlier,
 *     but never before the morning hour: an 07:30 exam must not wake a student
 *     at 05:30. That clamp is the whole reason this is a function and not a
 *     subtraction at the call site.
 *
 * `late` exists because a missed cron run must not silently lose the message.
 * The Edge Function queries by date rather than by hour, so a run that starts
 * after the target hour still finds the exam; dedup is the notification_log
 * claim, not the hour test. An exam whose time has already passed is dropped —
 * "good luck" after the fact is worse than nothing.
 *
 * Mirrored for Deno in supabase/functions/_shared/examGoodLuckTiming.ts —
 * update both together.
 */

export type GoodLuckTimingInput = {
  /** Current org-local hour, 0–23. */
  nowHour: number
  /** Exam start time as "HH:MM" (or "HH:MM:SS" from Postgres `time`), or null. */
  examTime: string | null
  /** organizations.exam_good_luck_hour */
  morningHour: number
  /** organizations.exam_good_luck_hours_before */
  hoursBefore: number
}

/** The org-local hour at which the message should go out. */
export function targetHour(input: Omit<GoodLuckTimingInput, 'nowHour'>): number {
  const { examTime, morningHour, hoursBefore } = input
  const examHour = parseHour(examTime)
  if (examHour === null) return morningHour
  return Math.max(morningHour, examHour - hoursBefore)
}

/**
 * True when this hourly run should send. Sends at the target hour, and later on
 * the same day if the target hour was missed — but never after the exam has
 * started.
 */
export function isGoodLuckDue(input: GoodLuckTimingInput): boolean {
  const { nowHour, examTime } = input
  const target = targetHour(input)
  if (nowHour < target) return false

  const examHour = parseHour(examTime)
  // An exam already under way: too late to wish anyone luck.
  if (examHour !== null && nowHour >= examHour) return false

  return true
}

/** "09:30" / "09:30:00" → 9. Anything unparseable is treated as no time at all. */
function parseHour(examTime: string | null): number | null {
  if (!examTime) return null
  const m = examTime.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hour = Number(m[1])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  return hour
}
