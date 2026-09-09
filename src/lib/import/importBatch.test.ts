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
          // `.eq('id', …)` alone resolves; the re-claim path adds
          // `.eq('status','failed').select('id').maybeSingle()`, which is what
          // makes a retry of a rolled-back run atomic against a second retry.
          // Filters are collected and applied together, the way a real UPDATE
          // …WHERE works: applying the patch on the first `.eq()` would make
          // the later `.eq('status','failed')` compare against the value we
          // just wrote.
          const filters: Record<string, string> = {}
          const resolveTarget = () => {
            const found = batches.find((b) =>
              Object.entries(filters).every(([col, value]) => (b as unknown as Record<string, string>)[col] === value)
            )
            if (found) Object.assign(found, patch)
            return found
          }
          const chain = {
            eq(col: string, value: string) {
              filters[col] = value
              return chain
            },
            select: () => chain,
            maybeSingle: () => {
              const found = resolveTarget()
              return Promise.resolve({ data: found ? { id: found.id } : null, error: null })
            },
            then: (resolve: (v: unknown) => unknown) => {
              resolveTarget()
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return chain
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

    expect(batches[0].status).toBe('failed')

    // The earlier attempt wrote nothing, so the owner must be able to run
    // again — but that retry is the one MOST likely to duplicate, and it used
    // to answer 'unavailable', which made the route proceed with no
    // idempotency protection at all. It re-claims the same row instead.
    const retry = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(retry).toEqual({ kind: 'claimed', batchId: 'batch-1' })
    expect(batches).toHaveLength(1)
    expect(batches[0].status).toBe('running')

    // ...and a second retry racing it still loses.
    const concurrent = await claimImportBatch('org-1', 'key-1', 'students', 3, 'profile-1')
    expect(concurrent).toEqual({ kind: 'inFlight' })
  })
})

describe('deriveImportIdempotencyKey', () => {
  const rows = [{ data: { full_name: 'דנה', phone: '0501234567' } }, { data: { full_name: 'יוסי' } }]

  it('is the same for the same file, so a re-upload replays', async () => {
    const { deriveImportIdempotencyKey } = await import('./importBatch')
    // The old key was `crypto.randomUUID()` minted per PARSE, so re-uploading
    // the identical spreadsheet produced a fresh key and duplicated everything.
    expect(deriveImportIdempotencyKey('org-1', 'students', rows)).toBe(
      deriveImportIdempotencyKey('org-1', 'students', rows)
    )
  })

  it('ignores key order and the advisory preview fields', async () => {
    const { deriveImportIdempotencyKey } = await import('./importBatch')
    const reordered = [{ data: { phone: '0501234567', full_name: 'דנה' } }, { data: { full_name: 'יוסי' } }]
    const withNoise = [
      { data: { full_name: 'דנה', phone: '0501234567' }, errors: ['x'], existingId: null },
      { data: { full_name: 'יוסי' }, warnings: ['y'] },
    ]
    expect(deriveImportIdempotencyKey('org-1', 'students', reordered)).toBe(
      deriveImportIdempotencyKey('org-1', 'students', rows)
    )
    expect(deriveImportIdempotencyKey('org-1', 'students', withNoise)).toBe(
      deriveImportIdempotencyKey('org-1', 'students', rows)
    )
  })

  it('separates orgs, entity types and different content', async () => {
    const { deriveImportIdempotencyKey } = await import('./importBatch')
    const base = deriveImportIdempotencyKey('org-1', 'students', rows)
    expect(deriveImportIdempotencyKey('org-2', 'students', rows)).not.toBe(base)
    expect(deriveImportIdempotencyKey('org-1', 'parents', rows)).not.toBe(base)
    expect(
      deriveImportIdempotencyKey('org-1', 'students', [...rows, { data: { full_name: 'נועה' } }])
    ).not.toBe(base)
  })
})
