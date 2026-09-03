/** POST /api/import/execute — execute a previously previewed import. */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { executeImport } from '@/lib/import/executeImport'
import { getOrgTimezone } from '@/lib/organizations'
import type { EntityType, ValidatedRow } from '@/lib/import/validators'
import { getImportTranslator } from '@/lib/i18n/serverTranslator'

const VALID_TYPES: [EntityType, ...EntityType[]] = [
  'students', 'parents', 'teachers', 'lessons-schedule', 'lessons-history', 'family-list',
]

const importRowSchema = z.object({
  rowIndex: z.number().int().min(0),
  status: z.enum(['valid', 'warning', 'error']),
  data: z.record(z.string(), z.string().max(10_000).nullable()),
  errors: z.array(z.string().max(1_000)).max(100),
  warnings: z.array(z.string().max(1_000)).max(100),
  existingId: z.uuid().nullable().optional(),
  existingStudentId: z.uuid().nullable().optional(),
  existingParentId: z.uuid().nullable().optional(),
  missingDependencies: z.array(z.object({
    type: z.enum(['teacher', 'student']),
    name: z.string().max(500),
  })).max(100).optional(),
}).strict()

const executeImportSchema = z.object({
  entityType: z.enum(VALID_TYPES),
  rows: z.array(importRowSchema).min(1).max(2_000),
  attestConsent: z.boolean().optional(),
}).strict()

export async function POST(request: NextRequest) {
  const t = await getImportTranslator()
  const session = await getSession()
  requireMutation(session)

  if (!['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: t('apiErrors.noPermission') }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('apiErrors.invalidEntity') }, { status: 400 })
  }

  const parsed = executeImportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: t('apiErrors.invalidEntity') }, { status: 400 })
  }

  const { entityType, rows, attestConsent } = parsed.data
  try {
    const timezone = await getOrgTimezone(session.orgId)
    const result = await executeImport(
      session.orgId,
      entityType,
      rows as ValidatedRow[],
      timezone,
      t,
      { attestAll: attestConsent === true, userId: session.userId }
    )
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: t('apiErrors.executeError') }, { status: 500 })
  }
}
