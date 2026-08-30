/**
 * Per-student lesson tallies over a window, batched across siblings.
 *
 * Exists so the WhatsApp AI assistant can answer "how many lessons did we do
 * this year" with a real number instead of guessing. The query deliberately
 * mirrors buildProgressReportData's attendance query (progressReport.ts:105-112):
 * the number a parent is told on WhatsApp and the number printed on their
 * child's progress report must never disagree.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type StudentLessonCounts = {
  completed: number
  cancelled: number
  noShow: number
  /** completed + no_show — the attendance denominator used across the repo. */
  held: number
}

const COUNTED_STATUSES = ['completed', 'cancelled', 'no_show'] as const

export async function getLessonCountsForStudents(params: {
  db: SupabaseClient
  orgId: string
  studentIds: string[]
  fromIso: string
  toIso: string
}): Promise<Map<string, StudentLessonCounts>> {
  const { db, orgId, studentIds, fromIso, toIso } = params

  const counts = new Map<string, StudentLessonCounts>()
  if (studentIds.length === 0) return counts

  // Every requested student gets an entry, so the caller never has to tell
  // "no lessons" apart from "not looked up".
  for (const id of studentIds) {
    counts.set(id, { completed: 0, cancelled: 0, noShow: 0, held: 0 })
  }

  // One query for all the children. No .limit(): a silent truncation would
  // produce a wrong count, which is the exact failure this helper prevents.
  //
  // lesson_students.status is deliberately NOT filtered. Nothing in the product
  // writes it, every other counter ignores it, and filtering here would make
  // this the only place that does — diverging from the progress report.
  const { data, error } = await db
    .from('lesson_students')
    .select('student_id, lessons!inner ( status, start_at, organization_id )')
    .eq('organization_id', orgId)
    .in('student_id', studentIds)
    .eq('lessons.organization_id', orgId)
    .gte('lessons.start_at', fromIso)
    .lte('lessons.start_at', toIso)
    .in('lessons.status', COUNTED_STATUSES as unknown as string[])

  if (error) {
    throw new Error(`[lessonHistory] lessons query failed: ${error.message}`)
  }

  type Row = { student_id: string; lessons: { status: string } | null }

  for (const row of (data ?? []) as unknown as Row[]) {
    const entry = counts.get(row.student_id)
    if (!entry) continue

    switch (row.lessons?.status) {
      case 'completed':
        entry.completed += 1
        entry.held += 1
        break
      case 'no_show':
        entry.noShow += 1
        entry.held += 1
        break
      case 'cancelled':
        entry.cancelled += 1
        break
    }
  }

  return counts
}
