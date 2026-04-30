/**
 * Student exams / tests — manual grade records (Sprint: progress reports).
 * All access via service role client.
 */

import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type StudentExam = {
  id: string
  organizationId: string
  studentId: string
  subject: string
  title: string
  examDate: string // YYYY-MM-DD
  score: number
  maxScore: number
  notes: string | null
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
  score: number
  max_score: number
  notes: string | null
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
