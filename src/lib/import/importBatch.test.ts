import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ImportResult } from './executeImport'

type Batch = {
  id: string
  organization_id: string
  idempotency_key: string
  status: string
  result: ImportResult | null
}

const batches: Batch[] = []
let seq = 0

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from() {
      return {
        insert(row: Omit<Batch, 'id'>) {
          const clash = batches.find(
            (b) =>
              b.organization_id === row.organization_id &&
              b.idempotency_key === row.idempotency_key
          )
          if (clash) {
            const dup = { data: null, error: { code: '23505', message: 'duplicate key' } }
            return { select: () => ({ single: () => Promise.resolve(dup) }) }
          }
          const created = { ...row, id: `batch-${++seq}` }
          batches.push(created)
          return {
            select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
          }
        },
        select: () => ({
          eq() {
            return this
          },
          single: () => {
            const found = batches[batches.length - 1]
            return Promise.resolve({ data: found ?? null, error: null })
          },
        }),
        update(patch: Partial<Batch>) {
          return {
            eq(_col: string, id: string) {
              const found = batches.find((b) => b.id === id)
              if (found) Object.assign(found, patch)
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }),
}))

const RESULT: ImportResult = { inserted: 3, updated: 0, skipped: 0, errors: [] }

beforeEach(() => {
  batches.length = 0
  seq = 0
})

describe('claimImportBatch', () => {
  it('claims an unused key', async () => {
    const { claimImportBatch } = await import('./importBatch')
    const claim = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(claim).toEqual({ kind: 'claimed', batchId: 'batch-1' })
  })

  it('replays a completed run instead of importing twice', async () => {
    const { claimImportBatch, completeImportBatch } = await import('./importBatch')

    const first = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(first.kind).toBe('claimed')
    await completeImportBatch('batch-1', RESULT)

    const retry = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(retry).toEqual({ kind: 'replay', result: { ...RESULT, alreadyRan: true } })
    // Nothing new was written.
    expect(batches).toHaveLength(1)
  })

  it('reports a concurrent double-submit as in-flight rather than importing again', async () => {
    const { claimImportBatch } = await import('./importBatch')
    await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    const second = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(second).toEqual({ kind: 'inFlight' })
  })

  it('does not let a rolled-back run replay as a success', async () => {
    const { claimImportBatch, completeImportBatch } = await import('./importBatch')

    await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    await completeImportBatch('batch-1', { ...RESULT, inserted: 0, rolledBack: true })

    // The earlier attempt wrote nothing, so the owner must be able to run again.
    const retry = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(retry).toEqual({ kind: 'unavailable' })
    expect(batches[0].status).toBe('failed')
  })
})
