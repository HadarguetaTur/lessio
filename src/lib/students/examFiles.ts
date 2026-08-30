/**
 * Exam attachment helpers — a parent (portal) or student (WhatsApp bot)
 * attaches a file to an exam report.
 *
 * Bucket: exam-files (private, created in 20260829100000_exam_reports.sql).
 * Capped at 10MB so a portal upload fits the 11mb serverActions body limit.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ALLOWED_UPLOAD_MIME_TYPES } from '@/lib/storage/mime'

const BUCKET = 'exam-files'
export const MAX_EXAM_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export type ExamFileInput =
  | { file: File }
  | { buffer: Buffer; mimeType: string; fileName: string }

export type UploadedExamFile = {
  storagePath: string
  fileName: string
  mimeType: string | null
}

/**
 * Validates and uploads an exam attachment.
 * Throws i18n error keys for user-facing validation failures.
 */
export async function uploadExamFile(
  orgId: string,
  studentId: string,
  input: ExamFileInput
): Promise<UploadedExamFile> {
  let buffer: Buffer
  let mimeType: string
  let fileName: string

  if ('file' in input) {
    buffer = Buffer.from(await input.file.arrayBuffer())
    mimeType = input.file.type
    fileName = input.file.name
  } else {
    buffer = input.buffer
    mimeType = input.mimeType
    fileName = input.fileName
  }

  if (buffer.length === 0) throw new Error('validation.emptyFile')
  if (buffer.length > MAX_EXAM_FILE_SIZE) throw new Error('validation.fileTooLarge10')
  if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error('validation.unsupportedFileType')
  }

  const sanitizedName = fileName.replace(/[^\w.-]+/g, '_')
  const storagePath = `${orgId}/${studentId}/${Date.now()}-${sanitizedName}`

  const db = createServiceRoleClient()
  const { error } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType || undefined, upsert: false })

  if (error) throw new Error(`[examFiles] Storage upload failed: ${error.message}`)

  return { storagePath, fileName, mimeType: mimeType || null }
}

export async function getExamFileSignedUrl(storagePath: string): Promise<string> {
  const db = createServiceRoleClient()
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60)

  if (error || !data?.signedUrl) {
    throw new Error(`[examFiles] Failed to create signed URL: ${error?.message}`)
  }
  return data.signedUrl
}
