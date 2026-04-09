/**
 * POST /api/import/parse
 *
 * Accepts a multipart file upload, parses the XLSX/CSV, normalizes headers,
 * and validates each row. Returns the validated results as JSON.
 *
 * Body: FormData with fields:
 *   - file: the uploaded file
 *   - entityType: 'students' | 'parents' | 'teachers' | 'lessons-schedule' | 'lessons-history'
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { parseFile, normalizeHeaders } from '@/lib/import/parseFile'
import { validateRows, type EntityType } from '@/lib/import/validators'
import { detectDuplicates } from '@/lib/import/detectDuplicates'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const VALID_TYPES: EntityType[] = ['students', 'parents', 'teachers', 'lessons-schedule', 'lessons-history']

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const entityType = formData.get('entityType') as string

  if (!file) {
    return NextResponse.json({ error: 'לא הועלה קובץ' }, { status: 400 })
  }

  if (!VALID_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json({ error: 'סוג ישות לא תקין' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 5MB)' }, { status: 400 })
  }

  const validExtensions = ['.xlsx', '.xls', '.csv']
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!validExtensions.includes(ext)) {
    return NextResponse.json(
      { error: 'פורמט קובץ לא נתמך. יש להעלות XLSX, XLS או CSV' },
      { status: 400 }
    )
  }

  try {
    const buffer = await file.arrayBuffer()
    const { headers, rows } = parseFile(buffer, file.name)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'הקובץ ריק או לא מכיל נתונים' }, { status: 400 })
    }

    const { normalizedRows, mappedHeaders } = normalizeHeaders(rows, headers)
    const validatedRows = validateRows(normalizedRows, entityType as EntityType)
    const enrichedRows = await detectDuplicates(session.orgId, entityType as EntityType, validatedRows)

    const summary = {
      total: enrichedRows.length,
      valid: enrichedRows.filter((r) => r.status === 'valid').length,
      warnings: enrichedRows.filter((r) => r.status === 'warning').length,
      errors: enrichedRows.filter((r) => r.status === 'error').length,
      duplicates: enrichedRows.filter((r) => r.existingId).length,
    }

    return NextResponse.json({
      rows: enrichedRows,
      summary,
      mappedHeaders,
    })
  } catch {
    return NextResponse.json(
      { error: 'שגיאה בעיבוד הקובץ. ודא שהוא תקין ונסה שוב.' },
      { status: 500 }
    )
  }
}
