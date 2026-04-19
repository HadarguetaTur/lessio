/**
 * Homework submission helpers — student submits work, teacher grades it.
 * Per /docs/sprint-24-scope.md § Story 1.
 *
 * Bucket: homework-submissions (create via Supabase dashboard, not public).
 * Upsert semantics: one submission per (assignment_id, student_id).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'homework-submissions'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
])

export type HomeworkSubmission = {
  id: string
  organizationId: string
  assignmentId: string
  studentId: string
  storagePath: string | null
  fileName: string | null
  mimeType: string | null
  note: string | null
  score: number | null
  feedback: string | null
  gradedAt: string | null
  gradedBy: string | null
  submittedAt: string
  updatedAt: string
}

type SubmissionRow = {
  id: string
  organization_id: string
  assignment_id: string
  student_id: string
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  note: string | null
  score: number | null
  feedback: string | null
  graded_at: string | null
  graded_by: string | null
  submitted_at: string
  updated_at: string
}

function mapSubmission(row: SubmissionRow): HomeworkSubmission {
  return {
    id: row.id,
    organizationId: row.organization_id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    note: row.note,
    score: row.score,
    feedback: row.feedback,
    gradedAt: row.graded_at,
    gradedBy: row.graded_by,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  }
}

export async function getSubmission(
  orgId: string,
  assignmentId: string,
  studentId: string
): Promise<HomeworkSubmission | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_submissions')
    .select('*')
    .eq('organization_id', orgId)
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) throw new Error(`[homework/submissions] getSubmission failed: ${error.message}`)
  if (!data) return null
  return mapSubmission(data as SubmissionRow)
}

export async function getSubmissionsForAssignment(
  orgId: string,
  assignmentId: string
): Promise<(HomeworkSubmission & { studentName: string })[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_submissions')
    .select('*, students ( full_name )')
    .eq('organization_id', orgId)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: true })

  if (error) throw new Error(`[homework/submissions] getSubmissionsForAssignment failed: ${error.message}`)

  return (data ?? []).map((r) => {
    const row = r as SubmissionRow & { students: { full_name: string } | null }
    return {
      ...mapSubmission(row),
      studentName: row.students?.full_name ?? '',
    }
  })
}

/**
 * Upserts a student submission. File is optional (text-only submissions allowed).
 */
export async function submitHomework(params: {
  orgId: string
  assignmentId: string
  studentId: string
  note?: string
  file?: File
}): Promise<HomeworkSubmission> {
  const db = createServiceRoleClient()

  let storagePath: string | null = null
  let fileName: string | null = null
  let mimeType: string | null = null

  if (params.file && params.file.size > 0) {
    if (params.file.size > MAX_FILE_SIZE) {
      throw new Error('גודל הקובץ עולה על 20MB המותרים')
    }

    if (params.file.type && !ALLOWED_MIME_TYPES.has(params.file.type)) {
      throw new Error('סוג הקובץ אינו נתמך. סוגים מותרים: PDF, תמונות, Word, Excel, PowerPoint, טקסט')
    }

    storagePath = `${params.orgId}/${params.assignmentId}/${params.studentId}-${Date.now()}-${params.file.name}`
    fileName = params.file.name
    mimeType = params.file.type || null

    const buffer = Buffer.from(await params.file.arrayBuffer())
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: params.file.type, upsert: true })

    if (uploadError) throw new Error(`[homework/submissions] Storage upload failed: ${uploadError.message}`)
  }

  const now = new Date().toISOString()

  const { data, error } = await db
    .from('homework_submissions')
    .upsert(
      {
        organization_id: params.orgId,
        assignment_id:   params.assignmentId,
        student_id:      params.studentId,
        note:            params.note ?? null,
        storage_path:    storagePath,
        file_name:       fileName,
        mime_type:       mimeType,
        submitted_at:    now,
        updated_at:      now,
      },
      { onConflict: 'assignment_id,student_id', ignoreDuplicates: false }
    )
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework/submissions] submitHomework failed: ${error?.message}`)
  return mapSubmission(data as SubmissionRow)
}

export async function getSubmissionDownloadUrl(storagePath: string): Promise<string> {
  const db = createServiceRoleClient()
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60)

  if (error || !data?.signedUrl) {
    throw new Error(`[homework/submissions] Failed to create signed URL: ${error?.message}`)
  }
  return data.signedUrl
}

export async function gradeSubmission(params: {
  orgId: string
  submissionId: string
  score: number
  feedback: string
  gradedBy: string
}): Promise<HomeworkSubmission> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_submissions')
    .update({
      score:      params.score,
      feedback:   params.feedback,
      graded_by:  params.gradedBy,
      graded_at:  new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.submissionId)
    .eq('organization_id', params.orgId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework/submissions] gradeSubmission failed: ${error?.message}`)
  return mapSubmission(data as SubmissionRow)
}
