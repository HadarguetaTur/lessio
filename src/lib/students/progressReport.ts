/**
 * Build payload for student progress PDF — attendance, homework, exams, goals, notes.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { getGoalsForStudent } from '@/lib/goals'
import type { StudentGoal } from '@/lib/goals'
import { listExamsInDateRange, type StudentExam } from '@/lib/students/exams'

export type ProgressReportHomeworkRow = {
  assignmentTitle: string
  status: string
  score: number | null
  maxScore: number
  gradedAt: string | null
}

export type ProgressReportNoteRow = {
  body: string
  teacherName: string
  lessonStartAt: string
}

export interface ProgressReportData {
  student: { id: string; name: string }
  org: {
    id: string
    name: string
    logoUrl: string | null
    businessAddress: string | null
    whatsappNumber: string | null
  }
  /** Date-only boundaries (YYYY-MM-DD) in org timezone */
  period: { fromDate: string; toDate: string; labelFrom: string; labelTo: string }
  attendance: {
    total: number
    completed: number
    cancelled: number
    noShow: number
    ratePercent: number
  }
  homework: {
    total: number
    completed: number
    completionRatePercent: number
    avgScore: number | null
    rows: ProgressReportHomeworkRow[]
  }
  exams: StudentExam[]
  goals: { active: StudentGoal[]; achieved: StudentGoal[]; abandoned: StudentGoal[] }
  visibleNotes: ProgressReportNoteRow[]
  generatedAtIso: string
}

/**
 * @param fromDate YYYY-MM-DD (start of day in org TZ)
 * @param toDate YYYY-MM-DD (end of day in org TZ)
 */
export async function buildProgressReportData(
  studentId: string,
  orgId: string,
  fromDate: string,
  toDate: string
): Promise<ProgressReportData> {
  const db = createServiceRoleClient()
  const timezone = await getOrgTimezone(orgId)

  const fromStart = DateTime.fromISO(fromDate, { zone: timezone }).startOf('day')
  const toEnd = DateTime.fromISO(toDate, { zone: timezone }).endOf('day')
  if (!fromStart.isValid || !toEnd.isValid || fromStart > toEnd) {
    throw new Error('[progressReport] invalid date range')
  }

  const fromIso = fromStart.toUTC().toISO()
  const toIso = toEnd.toUTC().toISO()
  if (!fromIso || !toIso) {
    throw new Error('[progressReport] could not convert range to UTC')
  }

  const [{ data: student, error: sErr }, { data: org, error: oErr }] = await Promise.all([
    db.from('students').select('id, full_name').eq('id', studentId).eq('organization_id', orgId).single(),
    db
      .from('organizations')
      .select('id, name, logo_url, business_address, whatsapp_number')
      .eq('id', orgId)
      .single(),
  ])

  if (sErr || !student) throw new Error(`[progressReport] student not found: ${sErr?.message}`)
  if (oErr || !org) throw new Error(`[progressReport] org not found: ${oErr?.message}`)

  type OrgRow = {
    id: string
    name: string
    logo_url: string | null
    business_address: string | null
    whatsapp_number: string | null
  }
  const o = org as OrgRow
  const st = student as { id: string; full_name: string }

  // ── Attendance (same lesson statuses as portal progress) ─────────────────
  const { data: lessonRows, error: lErr } = await db
    .from('lesson_students')
    .select('lesson_id, lessons!inner ( status, start_at, organization_id )')
    .eq('student_id', studentId)
    .eq('lessons.organization_id', orgId)
    .gte('lessons.start_at', fromIso)
    .lte('lessons.start_at', toIso)
    .in('lessons.status', ['completed', 'cancelled', 'no_show'])

  if (lErr) throw new Error(`[progressReport] lessons query failed: ${lErr.message}`)

  type LRow = { lessons: { status: string; start_at: string } }
  const lessonsList = (lessonRows ?? []) as unknown as LRow[]
  const total = lessonsList.length
  const completed = lessonsList.filter((l) => l.lessons.status === 'completed').length
  const cancelled = lessonsList.filter((l) => l.lessons.status === 'cancelled').length
  const noShow = lessonsList.filter((l) => l.lessons.status === 'no_show').length
  const ratePercent = total > 0 ? Math.round((completed / total) * 100) : 0

  // ── Homework (sent assignments created in range) ─────────────────────────
  const { data: hwAssignments, error: hErr } = await db
    .from('homework_assignments')
    .select('id, title, status, created_at')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .eq('sent', true)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })

  if (hErr) throw new Error(`[progressReport] homework query failed: ${hErr.message}`)

  const assignIds = (hwAssignments ?? []).map((a) => (a as { id: string }).id)
  const submissionsMap = new Map<
    string,
    { score: number | null; graded_at: string | null }
  >()
  if (assignIds.length > 0) {
    const { data: subs, error: subErr } = await db
      .from('homework_submissions')
      .select('assignment_id, score, graded_at')
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .in('assignment_id', assignIds)

    if (subErr) throw new Error(`[progressReport] submissions query failed: ${subErr.message}`)
    for (const s of subs ?? []) {
      const row = s as { assignment_id: string; score: number | null; graded_at: string | null }
      submissionsMap.set(row.assignment_id, { score: row.score, graded_at: row.graded_at })
    }
  }

  const hwRows: ProgressReportHomeworkRow[] = []
  let hwDone = 0
  const scores: number[] = []
  for (const a of hwAssignments ?? []) {
    const row = a as { id: string; title: string; status: string }
    const sub = submissionsMap.get(row.id)
    const score = sub?.score ?? null
    if (row.status === 'done') hwDone += 1
    if (score != null) scores.push(score)
    hwRows.push({
      assignmentTitle: row.title,
      status: row.status,
      score,
      maxScore: 100,
      gradedAt: sub?.graded_at ?? null,
    })
  }
  const hwTotal = hwRows.length
  const completionRatePercent = hwTotal > 0 ? Math.round((hwDone / hwTotal) * 100) : 0
  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null

  // ── Exams in date range (unscored reports are excluded) ──────────────────
  const exams = (await listExamsInDateRange(orgId, studentId, fromDate, toDate)).filter(
    (e) => e.score != null
  )

  // ── Goals (full snapshot) ─────────────────────────────────────────────────
  const allGoals = await getGoalsForStudent(orgId, studentId)
  const active = allGoals.filter((g) => g.status === 'active')
  const achieved = allGoals.filter((g) => g.status === 'achieved')
  const abandoned = allGoals.filter((g) => g.status === 'abandoned')

  // ── Parent-visible notes for lessons in range ─────────────────────────────
  const { data: noteLessonRows } = await db
    .from('lesson_students')
    .select('lesson_id, lessons!inner ( start_at, organization_id )')
    .eq('student_id', studentId)
    .eq('lessons.organization_id', orgId)
    .gte('lessons.start_at', fromIso)
    .lte('lessons.start_at', toIso)

  const noteLessonIds = (noteLessonRows ?? []).map((r) => (r as { lesson_id: string }).lesson_id)
  const visibleNotes: ProgressReportNoteRow[] = []
  if (noteLessonIds.length > 0) {
    const { data: notes, error: nErr } = await db
      .from('lesson_notes')
      .select('body, lesson_id, teachers ( profiles ( full_name ) )')
      .eq('organization_id', orgId)
      .eq('visible_to_parent', true)
      .in('lesson_id', noteLessonIds)
      .order('created_at', { ascending: true })

    if (nErr) throw new Error(`[progressReport] notes query failed: ${nErr.message}`)

    const lessonStartMap = new Map<string, string>()
    for (const r of noteLessonRows ?? []) {
      const x = r as unknown as { lesson_id: string; lessons: { start_at: string } | null }
      if (x.lessons?.start_at) lessonStartMap.set(x.lesson_id, x.lessons.start_at)
    }

    for (const n of notes ?? []) {
      const nr = n as unknown as {
        body: string
        lesson_id: string
        teachers: { profiles: { full_name: string } | null } | null
      }
      visibleNotes.push({
        body: nr.body,
        teacherName: (nr.teachers?.profiles as { full_name: string } | null)?.full_name ?? '',
        lessonStartAt: lessonStartMap.get(nr.lesson_id) ?? '',
      })
    }
  }

  return {
    student: { id: st.id, name: st.full_name },
    org: {
      id: o.id,
      name: o.name,
      logoUrl: o.logo_url,
      businessAddress: o.business_address,
      whatsappNumber: o.whatsapp_number,
    },
    period: {
      fromDate,
      toDate,
      labelFrom: fromStart.toFormat('dd/MM/yyyy'),
      labelTo: toEnd.toFormat('dd/MM/yyyy'),
    },
    attendance: {
      total,
      completed,
      cancelled,
      noShow,
      ratePercent,
    },
    homework: {
      total: hwTotal,
      completed: hwDone,
      completionRatePercent,
      avgScore,
      rows: hwRows,
    },
    exams,
    goals: { active, achieved, abandoned },
    visibleNotes,
    generatedAtIso: DateTime.now().setZone(timezone).toISO() ?? new Date().toISOString(),
  }
}

/** Format lesson timestamp for PDF (org TZ, display date) */
export function formatProgressReportLessonDate(iso: string, orgTimezone: string): string {
  if (!iso) return ''
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(orgTimezone).toFormat('dd/MM/yyyy HH:mm')
}
