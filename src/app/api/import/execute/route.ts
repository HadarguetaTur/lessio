/**
 * POST /api/import/execute
 *
 * Executes the import with previously validated rows.
 *
 * Body JSON:
 *   - entityType: EntityType
 *   - rows: ValidatedRow[] (only valid/warning rows will be processed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { executeImport } from '@/lib/import/executeImport'
import { getOrgTimezone } from '@/lib/organizations'
import type { EntityType, ValidatedRow } from '@/lib/import/validators'

const VALID_TYPES: EntityType[] = ['students', 'parents', 'teachers', 'lessons-schedule', 'lessons-history']

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const body = await request.json()
  const { entityType, rows } = body as {
    entityType: string
    rows: ValidatedRow[]
  }

  if (!VALID_TYPES.includes(entityType as EntityType)) {
    return NextResponse.json({ error: 'סוג ישות לא תקין' }, { status: 400 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'אין שורות לייבוא' }, { status: 400 })
  }

  try {
    const timezone = await getOrgTimezone(session.orgId)
    const result = await executeImport(
      session.orgId,
      entityType as EntityType,
      rows,
      timezone
    )

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'שגיאה בביצוע הייבוא. נסה שוב.' },
      { status: 500 }
    )
  }
}
