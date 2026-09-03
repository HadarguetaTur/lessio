import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SeriesRule } from '@/lib/lessons/createSeries'
import { loadSeriesFootprint } from '@/lib/lessons/seriesFootprint'

export interface LessonSeriesListItem {
  id: string
  teacherName: string
  /** Participant names, derived from the series' upcoming lessons (falls back to the series' student_id). */
  studentNames: string[]
  /** Name of the student group a group series was built from; null otherwise or once the group is deleted. */
  groupName: string | null
  rule: SeriesRule
  upcomingCount: number
  /** When an admin stopped the series; null while it is active or simply ran out. */
  stoppedAt: string | null
  /** False once any occurrence has history — deleting the series is then refused. */
  canDelete: boolean
  /** How many occurrences carry that history, for the blocked-delete explanation. */
  historyCount: number
  /** Lessons a delete would remove — shown in the confirmation before it runs. */
  deletableCount: number
}

/**
 * All recurring series of the org with their teacher, participants and how many
 * scheduled lessons are still ahead. Series whose lessons are all in the past
 * (or cancelled) are returned too — they simply show 0 upcoming.
 */
export async function getLessonSeriesList(organizationId: string): Promise<LessonSeriesListItem[]> {
  const db = createServiceRoleClient()

  const { data: seriesRows, error } = await db
    .from('lesson_series')
    .select('id, student_id, rule, stopped_at, teachers(profiles(full_name)), student_groups(name)')
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
  if (!seriesRows?.length) return []

  // Participants come from the actual upcoming lessons — a series can hold a
  // pair/group whereas lesson_series.student_id records only one student.
  const { data: upcoming, error: upErr } = await db
    .from('lessons')
    .select('series_id, lesson_students(students(full_name))')
    .eq('organization_id', organizationId)
    .eq('status', 'scheduled')
    .gte('start_at', new Date().toISOString())
    .not('series_id', 'is', null)
  if (upErr) throw new Error(upErr.message)

  // One pass over the org's series occurrences answers "may this be deleted?"
  // for every row, with the same classifier the delete action itself uses.
  const footprints = await loadSeriesFootprint(db, organizationId)

  const countBySeries = new Map<string, number>()
  const namesBySeries = new Map<string, Set<string>>()
  for (const lesson of upcoming ?? []) {
    const sid = lesson.series_id as string
    countBySeries.set(sid, (countBySeries.get(sid) ?? 0) + 1)
    const names = namesBySeries.get(sid) ?? new Set<string>()
    for (const ls of (lesson.lesson_students as unknown as { students: { full_name: string } | null }[]) ?? []) {
      if (ls.students?.full_name) names.add(ls.students.full_name)
    }
    namesBySeries.set(sid, names)
  }

  // Fallback names for series with no upcoming lessons.
  const fallbackIds = seriesRows
    .filter((s) => !namesBySeries.get(s.id)?.size)
    .map((s) => s.student_id)
  const fallbackNames = new Map<string, string>()
  if (fallbackIds.length) {
    const { data: students } = await db
      .from('students')
      .select('id, full_name')
      .in('id', fallbackIds)
    for (const s of students ?? []) fallbackNames.set(s.id, s.full_name)
  }

  const items = seriesRows.map((s) => {
    const teacher = s.teachers as unknown as { profiles: { full_name: string } | null } | null
    const group = s.student_groups as unknown as { name: string } | null
    const derived = [...(namesBySeries.get(s.id) ?? [])]
    const fallback = fallbackNames.get(s.student_id)
    const footprint = footprints.get(s.id)
    const historyCount = footprint?.blocking.length ?? 0
    return {
      id: s.id,
      teacherName: teacher?.profiles?.full_name ?? '',
      studentNames: derived.length ? derived.sort() : fallback ? [fallback] : [],
      groupName: group?.name ?? null,
      rule: s.rule as SeriesRule,
      upcomingCount: countBySeries.get(s.id) ?? 0,
      stoppedAt: (s.stopped_at as string | null) ?? null,
      canDelete: historyCount === 0,
      historyCount,
      deletableCount: footprint?.removable.length ?? 0,
    }
  })

  return items.sort(
    (a, b) =>
      a.rule.day_of_week - b.rule.day_of_week || a.rule.start_time.localeCompare(b.rule.start_time)
  )
}
