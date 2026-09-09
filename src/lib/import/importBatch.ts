import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { EntityType } from './validators'
import type { ImportResult } from './executeImport'

/**
 * Idempotency for import execution.
 *
 * The preview the client holds goes stale the moment the first execute lands:
 * every row still says `existingId: null`, so re-posting it duplicates whatever
 * already made it in. The client stamps each preview with a key; the first
 * execute claims it, and any retry of the same preview replays the stored
 * result instead of writing again.
 */

export type BatchClaim =
  | { kind: 'claimed'; batchId: string }
  | { kind: 'replay'; result: ImportResult }
  | { kind: 'inFlight' }
  | { kind: 'unavailable' }

type StoredBatch = {
  id: string
  status: string
  result: ImportResult | null
}

/**
 * Try to claim `idempotencyKey` for this org. Losing the race is the point:
 * it means the same preview already ran.
 */
export async function claimImportBatch(
  orgId: string,
  idempotencyKey: string,
  entityType: EntityType,
  rowCount: number,
  createdBy: string | null
): Promise<BatchClaim> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('import_batches')
    .insert({
      organization_id: orgId,
      idempotency_key: idempotencyKey,
      entity_type: entityType,
      row_count: rowCount,
      status: 'running',
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (!error && data) return { kind: 'claimed', batchId: data.id }

  // 23505 = the unique (organization_id, idempotency_key) index fired.
  if (error?.code === '23505') {
    const { data: existing } = await db
      .from('import_batches')
      .select('id, status, result')
      .eq('organization_id', orgId)
      .eq('idempotency_key', idempotencyKey)
      .single<StoredBatch>()

    if (existing?.status === 'completed' && existing.result) {
      return { kind: 'replay', result: { ...existing.result, alreadyRan: true } }
    }
    // 'running' means a concurrent double-submit; 'failed' means the earlier
    // attempt rolled itself back, so a genuine retry needs a fresh key.
    return existing?.status === 'running' ? { kind: 'inFlight' } : { kind: 'unavailable' }
  }

  // The table may not exist yet on an environment that has not run the
  // migration. Losing idempotency is worse than failing the import loudly,
  // but blocking every import is worse still — so proceed unprotected.
  console.error('[import] could not claim a batch', error?.message)
  return { kind: 'unavailable' }
}

export async function completeImportBatch(
  batchId: string,
  result: ImportResult
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('import_batches')
    .update({
      // A rolled-back run wrote nothing, so its key must not replay as a
      // success — the owner is meant to fix the data and run again.
      status: result.rolledBack ? 'failed' : 'completed',
      result,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)

  if (error) console.error('[import] could not finalise batch', batchId, error.message)
}

export async function failImportBatch(batchId: string, message: string): Promise<void> {
  const db = createServiceRoleClient()
  await db
    .from('import_batches')
    .update({
      status: 'failed',
      result: { error: message },
      completed_at: new Date().toISOString(),
    })
    .eq('id', batchId)
}
