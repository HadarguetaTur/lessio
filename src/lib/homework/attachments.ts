/**
 * Homework attachment helpers — Supabase Storage.
 * Bucket: homework-attachments (create via Supabase dashboard, not public).
 * Per /docs/sprint-24-scope.md § Story 1.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'homework-attachments'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
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

export type HomeworkAttachment = {
  id: string
  assignmentId: string
  fileName: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
}

type AttachmentRow = {
  id: string
  assignment_id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

function mapAttachment(row: AttachmentRow): HomeworkAttachment {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }
}

export async function listAttachments(
  orgId: string,
  assignmentId: string
): Promise<HomeworkAttachment[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('homework_attachments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[homework/attachments] listAttachments failed: ${error.message}`)
  return (data ?? []).map((r) => mapAttachment(r as AttachmentRow))
}

export async function uploadAttachment(params: {
  orgId: string
  assignmentId: string
  uploadedBy: string
  file: File
}): Promise<HomeworkAttachment> {
  if (params.file.size > MAX_FILE_SIZE) {
    throw new Error('גודל הקובץ עולה על 10MB המותרים')
  }

  if (params.file.type && !ALLOWED_MIME_TYPES.has(params.file.type)) {
    throw new Error('סוג הקובץ אינו נתמך. סוגים מותרים: PDF, תמונות, Word, Excel, PowerPoint, טקסט')
  }

  const db = createServiceRoleClient()
  const storagePath = `${params.orgId}/${params.assignmentId}/${Date.now()}-${params.file.name}`

  const buffer = Buffer.from(await params.file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: params.file.type, upsert: false })

  if (uploadError) throw new Error(`[homework/attachments] Storage upload failed: ${uploadError.message}`)

  const { data, error } = await db
    .from('homework_attachments')
    .insert({
      organization_id: params.orgId,
      assignment_id:   params.assignmentId,
      file_name:       params.file.name,
      storage_path:    storagePath,
      mime_type:       params.file.type || null,
      size_bytes:      params.file.size,
      uploaded_by:     params.uploadedBy,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`[homework/attachments] DB insert failed: ${error?.message}`)
  return mapAttachment(data as AttachmentRow)
}

export async function getAttachmentDownloadUrl(storagePath: string): Promise<string> {
  const db = createServiceRoleClient()
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60) // 1 hour TTL

  if (error || !data?.signedUrl) {
    throw new Error(`[homework/attachments] Failed to create signed URL: ${error?.message}`)
  }
  return data.signedUrl
}

export async function deleteAttachment(orgId: string, attachmentId: string): Promise<void> {
  const db = createServiceRoleClient()

  const { data: row, error: fetchError } = await db
    .from('homework_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !row) throw new Error('[homework/attachments] Attachment not found')

  await db.storage.from(BUCKET).remove([(row as AttachmentRow).storage_path])

  const { error } = await db
    .from('homework_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('organization_id', orgId)

  if (error) throw new Error(`[homework/attachments] deleteAttachment failed: ${error.message}`)
}
