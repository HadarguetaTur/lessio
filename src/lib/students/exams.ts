/**
 * Student exams / tests — manual grade records (Sprint: progress reports).
 * All access via service role client.
 */

import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { uploadExamFile, type ExamFileInput } from '@/lib/students/examFiles'

export type ExamSource = 'staff' | 'parent' | 'student'
export type ExamStatus = 'reported' | 'scored'

export type StudentExam = {
  id: string
  organizationId: string
  studentId: string
  subject: string
  title: string
  examDate: string // YYYY-MM-DD
  score: number | null
  maxScore: number
  notes: string | null
  source: ExamSource
  status: ExamStatus
  description: string | null
  storagePath: string | null
  fileName: string | null
  mimeType: string | null
  reportedByParentId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

type ExamRow = {
  id: string
  organization_id: string
  student_id: string
  subject: string
  title: string
  exam_date: string
  score: number | null
  max_score: number
  notes: string | null
  source: ExamSource
  status: ExamStatus
  description: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  reported_by_parent_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapExam(row: ExamRow): StudentExam {
  return {
    id: row.id,
    organizationId: row.organization_id,
    studentId: row.student_id,
    subject: row.subject,
    title: row.title,
    examDate: row.exam_date,
    score: row.score,
    maxScore: row.max_score,
    notes: row.notes,
    source: row.source,
    status: row.status,
    description: row.description,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    reportedByParentId: row.reported_by_parent_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const ExamCreateSchema = z.object({
  studentId: z.string().uuid(),
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.coerce.number().int().min(0),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((d) => d.score <= d.maxScore, { message: 'score must not exceed maxScore' })

export const ExamUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.coerce.number().int().min(0),
  maxScore: z.coerce.number().int().min(1).max(1000),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((d) => d.score <= d.maxScore, { message: 'score must not exceed maxScore' })

export const ExamReportSchema = z.object({
  studentId: z.string().uuid(),
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function getExam(orgId: string, examId: string): Promise<StudentExam | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .select('*')
    .eq('id', examId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) throw new Error(`[exams] getExam failed: ${error.message}`)
  return data ? mapExam(data as ExamRow) : null
}

export async function listExams(orgId: string, studentId: string): Promise<StudentExam[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .order('exam_date', { ascending: false })

  if (error) throw new Error(`[exams] listExams failed: ${error.message}`)
  return (data ?? []).map((r) => mapExam(r as ExamRow))
}

export async function listExamsInDateRange(
  orgId: string,
  studentId: string,
  fromDate: string,
  toDate: string
): Promise<StudentExam[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .select('*')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .gte('exam_date', fromDate)
    .lte('exam_date', toDate)
    .order('exam_date', { ascending: false })

  if (error) throw new Error(`[exams] listExamsInDateRange failed: ${error.message}`)
  return (data ?? []).map((r) => mapExam(r as ExamRow))
}

export async function createExam(params: {
  orgId: string
  studentId: string
  createdBy: string
  input: z.infer<typeof ExamCreateSchema>
}): Promise<StudentExam> {
  const parsed = ExamCreateSchema.safeParse(params.input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid exam data')
  }
  const d = parsed.data
  if (d.studentId !== params.studentId) {
    throw new Error('[exams] studentId mismatch')
  }
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .insert({
      organization_id: params.orgId,
      student_id: d.studentId,
      subject: d.subject,
      title: d.title,
      exam_date: d.examDate,
      score: d.score,
      max_score: d.maxScore,
      notes: d.notes ?? null,
      created_by: params.createdBy,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`[exams] createExam failed: ${error?.message}`)
  return mapExam(data as ExamRow)
}

/**
 * A parent (portal) or student (WhatsApp bot) reports an exam — no score yet.
 * File upload happens first so a storage failure never leaves a half-record.
 */
export async function createExamReport(params: {
  orgId: string
  studentId: string
  source: 'parent' | 'student'
  reportedByParentId?: string
  input: z.infer<typeof ExamReportSchema>
  file?: ExamFileInput
}): Promise<StudentExam> {
  const parsed = ExamReportSchema.safeParse(params.input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid exam report')
  }
  const d = parsed.data
  if (d.studentId !== params.studentId) {
    throw new Error('[exams] studentId mismatch')
  }

  let storagePath: string | null = null
  let fileName: string | null = null
  let mimeType: string | null = null
  if (params.file) {
    const uploaded = await uploadExamFile(params.orgId, params.studentId, params.file)
    storagePath = uploaded.storagePath
    fileName = uploaded.fileName
    mimeType = uploaded.mimeType
  }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .insert({
      organization_id: params.orgId,
      student_id: d.studentId,
      subject: d.subject,
      title: d.title,
      exam_date: d.examDate,
      description: d.description ?? null,
      score: null,
      source: params.source,
      status: 'reported',
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      reported_by_parent_id: params.reportedByParentId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`[exams] createExamReport failed: ${error?.message}`)
  return mapExam(data as ExamRow)
}

/** Teacher fills in the score of a reported exam → it becomes a regular scored exam. */
export async function scoreExam(params: {
  orgId: string
  examId: string
  score: number
  maxScore: number
}): Promise<StudentExam> {
  if (!Number.isInteger(params.score) || params.score < 0 || params.score > params.maxScore) {
    throw new Error('score must be between 0 and maxScore')
  }
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .update({
      score: params.score,
      max_score: params.maxScore,
      status: 'scored',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.examId)
    .eq('organization_id', params.orgId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[exams] scoreExam failed: ${error?.message}`)
  return mapExam(data as ExamRow)
}

export async function updateExam(params: {
  orgId: string
  examId: string
  input: z.infer<typeof ExamUpdateSchema>
}): Promise<StudentExam> {
  const parsed = ExamUpdateSchema.safeParse(params.input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid exam data')
  }
  const d = parsed.data
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('student_exams')
    .update({
      subject: d.subject,
      title: d.title,
      exam_date: d.examDate,
      score: d.score,
      max_score: d.maxScore,
      notes: d.notes ?? null,
      // ExamUpdateSchema requires a score, so an edited report becomes scored
      status: 'scored',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.examId)
    .eq('organization_id', params.orgId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`[exams] updateExam failed: ${error?.message}`)
  return mapExam(data as ExamRow)
}

export async function deleteExam(orgId: string, examId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('student_exams')
    .delete()
    .eq('id', examId)
    .eq('organization_id', orgId)

  if (error) throw new Error(`[exams] deleteExam failed: ${error.message}`)
}
