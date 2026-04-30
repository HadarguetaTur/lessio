import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ProgressReportData } from '@/lib/students/progressReport'
import { buildProgressReportData } from '@/lib/students/progressReport'
import ProgressReportDocument from '@/lib/students/progressReportDocument'

const BUCKET = 'progress-reports'
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60

export async function uploadProgressReportPdf(
  orgId: string,
  studentId: string,
  fileBaseName: string,
  pdfBuffer: Buffer
): Promise<string> {
  const supabase = createServiceRoleClient()
  const safeBase = fileBaseName.replace(/[^\w.-]+/g, '_')
  const storagePath = `${orgId}/progress/${studentId}/${safeBase}.pdf`

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

  if (error) {
    throw new Error(`[uploadProgressReportPdf] failed to upload ${storagePath}: ${error.message}`)
  }

  return storagePath
}

export async function getProgressReportSignedUrl(path: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(
      `[getProgressReportSignedUrl] failed for ${path}: ${error?.message ?? 'no URL returned'}`
    )
  }

  return data.signedUrl
}

/**
 * Build JSON payload and render PDF bytes (no upload).
 */
export async function renderProgressReportPdfBufferFromData(
  data: ProgressReportData,
  orgTimezone: string
): Promise<Buffer> {
  const element = React.createElement(ProgressReportDocument, {
    data,
    orgTimezone,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)
  return Buffer.from(pdfBuffer)
}

export async function renderProgressReportPdfBuffer(
  studentId: string,
  orgId: string,
  fromDate: string,
  toDate: string,
  orgTimezone: string
): Promise<Buffer> {
  const data = await buildProgressReportData(studentId, orgId, fromDate, toDate)
  return renderProgressReportPdfBufferFromData(data, orgTimezone)
}

/**
 * Render PDF, upload to storage, return signed download URL.
 */
export async function generateAndStoreProgressReport(
  studentId: string,
  orgId: string,
  fromDate: string,
  toDate: string,
  orgTimezone: string
): Promise<{ signedUrl: string; storagePath: string }> {
  const buffer = await renderProgressReportPdfBuffer(studentId, orgId, fromDate, toDate, orgTimezone)
  const ts = Date.now()
  const path = await uploadProgressReportPdf(orgId, studentId, `report-${fromDate}-${toDate}-${ts}`, buffer)
  const signedUrl = await getProgressReportSignedUrl(path)
  return { signedUrl, storagePath: path }
}
