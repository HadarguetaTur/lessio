/**
 * Lesson notes — structured teacher notes after each lesson.
 * Per /docs/sprint-24-scope.md § Story 2.
 *
 * Visibility:
 *  - Teacher who wrote it: read + delete
 *  - Owner/admin: read all notes for org
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type LessonNote = {
  id: string
  organizationId: string
  lessonId: string
  teacherId: string
  teacherName: string
  body: string
  visibleToParent: boolean
  createdAt: string
  updatedAt: string
}

type NoteRow = {
  id: string
  organization_id: string
  lesson_id: string
  teacher_id: string
  body: string
  visible_to_parent: boolean
  created_at: string
  updated_at: string
  teachers: { profiles: { full_name: string } | null } | null
}

function mapNote(row: NoteRow): LessonNote {
  return {
    id: row.id,
    organizationId: row.organization_id,
    lessonId: row.lesson_id,
    teacherId: row.teacher_id,
    teacherName: (row.teachers?.profiles as { full_name: string } | null)?.full_name ?? '',
    body: row.body,
    visibleToParent: row.visible_to_parent ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getNotes(orgId: string, lessonId: string): Promise<LessonNote[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_notes')
    .select('*, teachers ( profiles ( full_name ) )')
    .eq('organization_id', orgId)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[lesson/notes] getNotes failed: ${error.message}`)
  return (data ?? []).map((r) => mapNote(r as NoteRow))
}

export async function getNotesForStudent(
  orgId: string,
  studentId: string
): Promise<(LessonNote & { lessonStartAt: string })[]> {
  const db = createServiceRoleClient()

  // Find lessons that involve this student
  const { data: lessonStudents, error: lsError } = await db
    .from('lesson_students')
    .select('lesson_id, lessons ( start_at )')
    .eq('student_id', studentId)

  if (lsError) throw new Error(`[lesson/notes] getNotesForStudent failed: ${lsError.message}`)

  const lessonIds = (lessonStudents ?? []).map((ls) => ls.lesson_id)
  if (lessonIds.length === 0) return []

  type LsRow = { lesson_id: string; lessons: { start_at: string } | null }
  const lessonStartMap = new Map<string, string>(
    (lessonStudents ?? []).map((ls) => {
      const r = ls as unknown as LsRow
      return [r.lesson_id, r.lessons?.start_at ?? '']
    })
  )

  const { data, error } = await db
    .from('lesson_notes')
    .select('*, teachers ( profiles ( full_name ) )')
    .eq('organization_id', orgId)
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`[lesson/notes] getNotesForStudent failed: ${error.message}`)

  return (data ?? []).map((r) => ({
    ...mapNote(r as NoteRow),
    lessonStartAt: lessonStartMap.get((r as NoteRow).lesson_id) ?? '',
  }))
}

/**
 * Parent-visible notes for a student — used in portal progress tab.
 */
export async function getVisibleNotesForStudent(
  orgId: string,
  studentId: string,
  limit = 10
): Promise<(LessonNote & { lessonStartAt: string })[]> {
  const db = createServiceRoleClient()

  const { data: lessonStudents } = await db
    .from('lesson_students')
    .select('lesson_id, lessons ( start_at )')
    .eq('student_id', studentId)

  const lessonIds = (lessonStudents ?? []).map((ls) => ls.lesson_id)
  if (lessonIds.length === 0) return []

  type LsRow = { lesson_id: string; lessons: { start_at: string } | null }
  const lessonStartMap = new Map<string, string>(
    (lessonStudents ?? []).map((ls) => {
      const r = ls as unknown as LsRow
      return [r.lesson_id, r.lessons?.start_at ?? '']
    })
  )

  const { data, error } = await db
    .from('lesson_notes')
    .select('*, teachers ( profiles ( full_name ) )')
    .eq('organization_id', orgId)
    .eq('visible_to_parent', true)
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`[lesson/notes] getVisibleNotesForStudent failed: ${error.message}`)

  return (data ?? []).map((r) => ({
    ...mapNote(r as NoteRow),
    lessonStartAt: lessonStartMap.get((r as NoteRow).lesson_id) ?? '',
  }))
}

export async function createNote(params: {
  orgId: string
  lessonId: string
  teacherId: string
  body: string
  visibleToParent?: boolean
}): Promise<LessonNote> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_notes')
    .insert({
      organization_id:  params.orgId,
      lesson_id:        params.lessonId,
      teacher_id:       params.teacherId,
      body:             params.body,
      visible_to_parent: params.visibleToParent ?? false,
    })
    .select('*, teachers ( profiles ( full_name ) )')
    .single()

  if (error || !data) throw new Error(`[lesson/notes] createNote failed: ${error?.message}`)
  return mapNote(data as NoteRow)
}

/**
 * Deletes a note. Teacher can only delete their own notes; owner/admin can delete any.
 */
export async function deleteNote(params: {
  orgId: string
  noteId: string
  actorTeacherId?: string  // if set, enforces ownership check
}): Promise<void> {
  const db = createServiceRoleClient()

  let query = db
    .from('lesson_notes')
    .delete()
    .eq('id', params.noteId)
    .eq('organization_id', params.orgId)

  if (params.actorTeacherId) {
    query = query.eq('teacher_id', params.actorTeacherId)
  }

  const { error } = await query
  if (error) throw new Error(`[lesson/notes] deleteNote failed: ${error.message}`)
}
