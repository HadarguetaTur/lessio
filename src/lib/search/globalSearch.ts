import { createClient } from '@/lib/supabase/server'
import { OPEN_CHARGE_STATUSES } from '@/lib/charges'
import type { GlobalSearchResponse, SearchChargeHit, SearchLessonHit, SearchParentHit, SearchStudentHit } from './types'

const LIMIT_STUDENTS = 15
const LIMIT_PARENTS = 10
const LIMIT_LESSON_ROWS = 50
const LIMIT_LESSONS_OUT = 15
const LIMIT_CHARGES = 15

/** Strip ILIKE wildcards from user input to avoid broad scans / injection patterns. */
function sanitizeIlikeFragment(raw: string): string {
  return raw.replace(/[%_\\]/g, '').trim()
}

export async function globalSearch(params: {
  organizationId: string
  role: string
  query: string
}): Promise<GlobalSearchResponse> {
  const fragment = sanitizeIlikeFragment(params.query)
  if (fragment.length < 2) {
    return { students: [], parents: [], lessons: [], charges: [] }
  }

  const pattern = `%${fragment}%`
  const supabase = await createClient()
  const orgId = params.organizationId
  const canSeeCharges = params.role === 'owner' || params.role === 'admin'

  const [studentsRes, parentsRes] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, grade')
      .eq('organization_id', orgId)
      .ilike('full_name', pattern)
      .order('full_name', { ascending: true })
      .limit(LIMIT_STUDENTS),
    supabase
      .from('parents')
      .select('id, full_name, phone')
      .eq('organization_id', orgId)
      .ilike('full_name', pattern)
      .order('full_name', { ascending: true })
      .limit(LIMIT_PARENTS),
  ])

  if (studentsRes.error) throw new Error(studentsRes.error.message)
  if (parentsRes.error) throw new Error(parentsRes.error.message)

  const students: SearchStudentHit[] = (studentsRes.data ?? []).map((row) => ({
    kind: 'student',
    id: row.id as string,
    full_name: row.full_name as string,
    grade: (row.grade as string | null) ?? null,
  }))

  const parents: SearchParentHit[] = (parentsRes.data ?? []).map((row) => ({
    kind: 'parent',
    id: row.id as string,
    full_name: row.full_name as string,
    phone: (row.phone as string | null) ?? null,
  }))

  const studentIdsFromName = new Set(students.map((s) => s.id))
  const parentIdsFromName = new Set(parents.map((p) => p.id))

  let studentIdsFromParents: string[] = []
  if (parentIdsFromName.size > 0) {
    const { data: relByParent, error: relErr } = await supabase
      .from('relationships')
      .select('student_id')
      .eq('organization_id', orgId)
      .in('parent_id', [...parentIdsFromName])

    if (relErr) throw new Error(relErr.message)
    studentIdsFromParents = [...new Set((relByParent ?? []).map((r) => r.student_id as string))]
  }

  const unionStudentIds = new Set([...studentIdsFromName, ...studentIdsFromParents])

  const studentIdsOnlyFromParent = studentIdsFromParents.filter((id) => !studentIdsFromName.has(id))
  let studentsExtra: SearchStudentHit[] = []
  if (studentIdsOnlyFromParent.length > 0) {
    const { data: stExtra, error: stExErr } = await supabase
      .from('students')
      .select('id, full_name, grade')
      .eq('organization_id', orgId)
      .in('id', studentIdsOnlyFromParent)
      .order('full_name', { ascending: true })

    if (stExErr) throw new Error(stExErr.message)
    studentsExtra = (stExtra ?? []).map((row) => ({
      kind: 'student',
      id: row.id as string,
      full_name: row.full_name as string,
      grade: (row.grade as string | null) ?? null,
    }))
  }

  const parentIdsForCharges = new Set<string>([...parentIdsFromName])

  if (unionStudentIds.size > 0) {
    const { data: relForStudents, error: relStErr } = await supabase
      .from('relationships')
      .select('parent_id, student_id, parents(id, full_name, phone)')
      .eq('organization_id', orgId)
      .in('student_id', [...unionStudentIds])

    if (relStErr) throw new Error(relStErr.message)

    for (const row of relForStudents ?? []) {
      parentIdsForCharges.add(row.parent_id as string)
      const p = row.parents as unknown as { id: string; full_name: string; phone: string } | null
      if (p && !parents.some((x) => x.id === p.id)) {
        parents.push({
          kind: 'parent',
          id: p.id,
          full_name: p.full_name,
          phone: p.phone ?? null,
        })
      }
    }
  }

  const lessons: SearchLessonHit[] = []
  if (unionStudentIds.size > 0) {
    const { data: lsRows, error: lsErr } = await supabase
      .from('lesson_students')
      .select(
        `
        student_id,
        students ( full_name ),
        lessons ( id, start_at, status, organization_id )
      `
      )
      .in('student_id', [...unionStudentIds])
      .limit(LIMIT_LESSON_ROWS)

    if (lsErr) throw new Error(lsErr.message)

    const byLesson = new Map<string, { start_at: string; status: string; names: Set<string> }>()
    for (const row of lsRows ?? []) {
      const lesson = row.lessons as unknown as {
        id: string
        start_at: string
        status: string
        organization_id: string
      } | null
      if (!lesson || lesson.organization_id !== orgId) continue

      const st = row.students as unknown as { full_name: string } | null
      const name = st?.full_name
      if (!byLesson.has(lesson.id)) {
        byLesson.set(lesson.id, {
          start_at: lesson.start_at,
          status: lesson.status,
          names: new Set(),
        })
      }
      if (name) byLesson.get(lesson.id)!.names.add(name)
    }

    const sorted = [...byLesson.entries()].sort((a, b) =>
      b[1].start_at.localeCompare(a[1].start_at)
    )
    for (const [id, v] of sorted.slice(0, LIMIT_LESSONS_OUT)) {
      lessons.push({
        kind: 'lesson',
        id,
        start_at: v.start_at,
        status: v.status,
        student_names: [...v.names].sort((x, y) => x.localeCompare(y, 'he')),
      })
    }
  }

  const charges: SearchChargeHit[] = []
  if (canSeeCharges && parentIdsForCharges.size > 0) {
    const { data: chRows, error: chErr } = await supabase
      .from('charges')
      .select('id, amount, status, charge_type, parent_id, parents(id, full_name)')
      .eq('organization_id', orgId)
      .in('parent_id', [...parentIdsForCharges])
      .in('status', [...OPEN_CHARGE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(LIMIT_CHARGES)

    if (chErr) throw new Error(chErr.message)

    for (const row of chRows ?? []) {
      const pr = row.parents as unknown as { id: string; full_name: string } | null
      charges.push({
        kind: 'charge',
        id: row.id as string,
        amount: Number(row.amount),
        status: row.status as string,
        charge_type: row.charge_type as string,
        parent_id: row.parent_id as string,
        parent_name: pr?.full_name ?? '',
      })
    }
  }

  const studentDedup = new Map<string, SearchStudentHit>()
  for (const s of [...students, ...studentsExtra]) {
    if (!studentDedup.has(s.id)) studentDedup.set(s.id, s)
  }

  const parentDedup = new Map<string, SearchParentHit>()
  for (const p of parents) {
    if (!parentDedup.has(p.id)) parentDedup.set(p.id, p)
  }

  return {
    students: [...studentDedup.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    parents: [...parentDedup.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    lessons,
    charges,
  }
}
