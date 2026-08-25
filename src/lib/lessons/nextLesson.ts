/**
 * Which of today's lessons is "next"?
 * Pure helper — lives in lib (not the component) so its test imports a plain module.
 */

export function findNextLessonId(
  lessons: Array<{ id: string; status: string; start_at: string }>,
  nowISO: string
): string | null {
  // Input arrives time-sorted from getTodayLessons; ISO UTC strings compare as strings.
  const next = lessons.find((l) => l.status === 'scheduled' && l.start_at >= nowISO)
  return next?.id ?? null
}
