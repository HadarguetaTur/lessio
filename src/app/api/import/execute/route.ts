/** POST /api/import/execute — execute a previously previewed import. */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { executeImport } from '@/lib/import/executeImport'
import { getOrgTimezone } from '@/lib/organizations'
import type { EntityType, ValidatedRow } from '@/lib/import/validators'
import { getImportTranslator } from '@/lib/i18n/serverTranslator'
import {
  claimImportBatch,
  completeImportBatch,
  failImportBatch,
  deriveImportIdempotencyKey,
} from '@/lib/import/importBatch'
import { QuotaExceededError } from '@/lib/saas/quota'

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
  /**
   * Accepted for compatibility with older clients and then IGNORED. The key is
   * derived server-side from the rows themselves — a client-minted nonce made
   * idempotency optional (omit it, get none) and per-parse rather than
   * per-file (re-upload the same spreadsheet, get a second full import).
   */
  idempotencyKey: z.uuid().optional(),
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

  // Claim before writing anything, ALWAYS — the claim is no longer conditional
  // on the client having sent a key, because an optional key is not
  // idempotency. The key is derived from the payload, so re-uploading the same
  // spreadsheet replays instead of importing it a second time.
  let batchId: string | null = null
  const claim = await claimImportBatch(
    session.orgId,
    deriveImportIdempotencyKey(session.orgId, entityType, rows),
    entityType,
    rows.length,
    session.profileId
  )

  if (claim.kind === 'replay') return NextResponse.json(claim.result)
  if (claim.kind === 'inFlight') {
    return NextResponse.json({ error: t('apiErrors.importAlreadyRan') }, { status: 409 })
  }
  if (claim.kind === 'claimed') batchId = claim.batchId

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

    if (batchId) await completeImportBatch(batchId, result)

    return NextResponse.json(result)
  } catch (e) {
    if (batchId) await failImportBatch(batchId, e instanceof Error ? e.message : 'unknown')

    // A quota refusal is an answer, not a crash — it used to be swallowed into
    // a generic 500 with no hint about what to do.
    if (e instanceof QuotaExceededError) {
      return NextResponse.json({ error: t('apiErrors.quotaExceeded') }, { status: 400 })
    }

    console.error('[import/execute] unexpected failure', e)
    return NextResponse.json({ error: t('apiErrors.executeError') }, { status: 500 })
  }
}
