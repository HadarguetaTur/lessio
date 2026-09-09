import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(),
  getProvider: vi.fn(),
  issueReceipt: vi.fn(),
  logAudit: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mocks.createDb }))
vi.mock('@/lib/payments/factory', () => ({ getPaymentProvider: mocks.getProvider }))
vi.mock('@/lib/receipts/issueReceiptForCharge', () => ({
  issueReceiptForCharge: mocks.issueReceipt,
}))
vi.mock('@/lib/charges/audit', () => ({ logChargeAudit: mocks.logAudit }))
vi.mock('@/lib/server/afterResponse', () => ({
  runAfterResponse: async (work: Promise<unknown>) => { await work },
}))

import { POST } from './route'

type Provider = 'stripe' | 'payplus' | 'cardcom' | 'grow'

function callback(
  provider: Provider,
  reference = 'ref-1',
  amount = 100,
  merchantReference = 'charge-1'
): { body: string; headers: HeadersInit } {
  if (provider === 'stripe') {
    return {
      body: JSON.stringify({
        id: 'evt-1', type: 'checkout.session.completed',
        data: { object: {
          id: reference, payment_status: 'paid', amount_total: Math.round(amount * 100),
          client_reference_id: merchantReference,
        } },
      }),
      headers: { 'content-type': 'application/json', 'stripe-signature': 'test' },
    }
  }
  if (provider === 'payplus') {
    return {
      body: JSON.stringify({
        payment_request_uid: reference, status: 'success', amount, more_info: merchantReference,
      }),
      headers: { 'content-type': 'application/json', hash: 'test', 'user-agent': 'PayPlus' },
    }
  }
  if (provider === 'grow') {
    return {
      body: new URLSearchParams({
        processToken: reference, processId: 'process-1', statusCode: '2',
      }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }
  }
  return {
    body: new URLSearchParams({ lowProfileCode: reference, ResponseCode: '0' }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }
}

interface ChargeRow {
  id: string
  organization_id: string
  status: string
  amount: number
  amount_paid: number
  parent_id: string | null
  payment_reference: string | null
}

interface DbOptions {
  provider: Provider
  charges?: Partial<ChargeRow>[]
  /** Reference history rows, as the DB trigger would have written them. */
  references?: Array<{ charge_id: string; payment_reference: string; amount: number }>
  /** Payments already in the ledger before the callback arrives. */
  payments?: Array<{ charge_id: string; provider_reference: string | null; amount: number }>
  /** Simulates a schema behind on 20260906090000. */
  missingIdempotencyColumn?: boolean
  /** Simulates an environment without the reference-history table. */
  missingReferenceHistory?: boolean
}

function fakeDb(options: DbOptions) {
  const charges: ChargeRow[] = (options.charges ?? [{}]).map((c, index) => ({
    id: `charge-${index + 1}`,
    organization_id: 'org-1',
    status: 'pending',
    amount: 100,
    amount_paid: 0,
    parent_id: 'parent-1',
    payment_reference: 'ref-1',
    ...c,
  }))
  const references = [...(options.references ?? charges
    .filter((c) => c.payment_reference)
    .map((c) => ({
      charge_id: c.id,
      payment_reference: c.payment_reference as string,
      amount: Math.max(0, c.amount - c.amount_paid),
    })))]
  const payments = [...(options.payments ?? [])]

  class Query {
    table: string
    action = 'select'
    values: Record<string, unknown> = {}
    filters: Record<string, unknown> = {}
    inFilter: { column: string; values: unknown[] } | null = null
    ignoreDuplicates = false

    constructor(table: string) { this.table = table }
    select() { return this }
    update(values: Record<string, unknown>) { this.action = 'update'; this.values = values; return this }
    insert(values: Record<string, unknown>) { this.action = 'insert'; this.values = values; return this }
    upsert(values: Record<string, unknown>, opts?: { ignoreDuplicates?: boolean }) {
      this.action = 'upsert'
      this.values = values
      this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates)
      return this
    }
    eq(column: string, value: unknown) { this.filters[column] = value; return this }
    in(column: string, values: unknown[]) { this.inFilter = { column, values }; return this }
    single() { return this.executeSingle() }
    maybeSingle() { return this.executeSingle() }
    async executeSingle() {
      const result = await this.execute()
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data
      return { ...result, data }
    }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return this.execute().then(resolve, reject)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(): Promise<{ data: any; error: any }> {
      if (this.table === 'organizations') {
        return { data: { payment_provider: options.provider }, error: null }
      }

      if (this.table === 'charge_payment_references') {
        if (options.missingReferenceHistory) {
          return { data: null, error: { code: '42P01', message: 'relation does not exist' } }
        }
        return {
          data: references.filter((r) => r.payment_reference === this.filters.payment_reference),
          error: null,
        }
      }

      if (this.table === 'charges' && this.action === 'select') {
        // Copies, not live references — a real SELECT is a snapshot, and the
        // handler holding one across a provider round-trip is the whole point
        // of the "owner marks paid mid-flight" test below.
        const snapshot = (rows: ChargeRow[]) => rows.map((r) => ({ ...r }))
        if (this.inFilter?.column === 'id') {
          return {
            data: snapshot(charges.filter((c) => this.inFilter!.values.includes(c.id))),
            error: null,
          }
        }
        if ('payment_reference' in this.filters) {
          return {
            data: snapshot(
              charges.filter((c) => c.payment_reference === this.filters.payment_reference)
            ),
            error: null,
          }
        }
        return { data: snapshot(charges.filter((c) => c.id === this.filters.id)), error: null }
      }

      if (this.table === 'charges' && this.action === 'update') {
        if ('provider_transaction_ids' in this.values) return { data: null, error: null }
        const target = charges.find((c) => c.id === this.filters.id)
        if (!target) return { data: [], error: null }
        // Optimistic filters: a stale status or amount_paid matches nothing, as
        // in Postgres.
        if ('status' in this.filters && this.filters.status !== target.status) {
          return { data: [], error: null }
        }
        if (
          'amount_paid' in this.filters &&
          Number(this.filters.amount_paid) !== Number(target.amount_paid)
        ) {
          return { data: [], error: null }
        }
        Object.assign(target, this.values)
        return { data: [{ id: target.id }], error: null }
      }

      if (this.table === 'charge_payments' && this.action === 'select') {
        return {
          data: payments.filter((p) => p.charge_id === this.filters.charge_id).map((p) => ({ amount: p.amount })),
          error: null,
        }
      }

      if (this.table === 'charge_payments' && (this.action === 'upsert' || this.action === 'insert')) {
        if (options.missingIdempotencyColumn) {
          return {
            data: null,
            error: {
              code: '42P10',
              message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
            },
          }
        }
        const chargeId = String(this.values.charge_id)
        const reference = (this.values.provider_reference as string | null) ?? null
        const exists = payments.some(
          (p) => p.charge_id === chargeId && p.provider_reference === reference
        )
        if (!exists) {
          payments.push({ charge_id: chargeId, provider_reference: reference, amount: Number(this.values.amount) })
        }
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }
  }

  return {
    db: { from: (table: string) => new Query(table) },
    charges,
    payments,
    chargeById: (id: string) => charges.find((c) => c.id === id)!,
    paymentsFor: (id: string) => payments.filter((p) => p.charge_id === id),
    totalRecorded: (id: string) =>
      Math.round(payments.filter((p) => p.charge_id === id).reduce((s, p) => s + p.amount, 0) * 100) / 100,
  }
}

function useProvider(provider: Provider, ok = true) {
  mocks.getProvider.mockResolvedValue({
    provider: provider === 'cardcom' || provider === 'grow'
      ? { confirmTransaction: vi.fn().mockResolvedValue(ok) }
      : { verifyWebhookRequest: vi.fn().mockReturnValue(ok) },
    providerName: provider,
  })
}

async function deliver(provider: Provider, body: string, headers: HeadersInit) {
  return POST(new NextRequest(`http://localhost/api/payments/${provider}`, {
    method: 'POST', body, headers,
  }), { params: Promise.resolve({ provider }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.issueReceipt.mockResolvedValue('https://receipt')
  mocks.logAudit.mockResolvedValue(undefined)
})

describe.each<Provider>(['stripe', 'payplus', 'cardcom'])('%s payment callback security', (provider) => {
  it('leaves the database unchanged for a forged callback/nonexistent confirmation', async () => {
    const world = fakeDb({ provider })
    mocks.createDb.mockReturnValue(world.db)
    useProvider(provider, false)
    const request = callback(provider)

    await deliver(provider, request.body, request.headers)

    expect(world.chargeById('charge-1').status).toBe('pending')
    expect(world.payments).toHaveLength(0)
    expect(mocks.issueReceipt).not.toHaveBeenCalled()
  })

  it('records one payment when the same valid callback is delivered twice', async () => {
    const world = fakeDb({ provider })
    mocks.createDb.mockReturnValue(world.db)
    useProvider(provider)
    const request = callback(provider)

    await deliver(provider, request.body, request.headers)
    await deliver(provider, request.body, request.headers)

    expect(world.chargeById('charge-1').status).toBe('paid')
    expect(world.paymentsFor('charge-1')).toHaveLength(1)
    expect(world.totalRecorded('charge-1')).toBe(100)
  })

  it('records one payment when duplicate valid callbacks arrive concurrently', async () => {
    const world = fakeDb({ provider })
    mocks.createDb.mockReturnValue(world.db)
    useProvider(provider)
    const request = callback(provider)

    await Promise.all([
      deliver(provider, request.body, request.headers),
      deliver(provider, request.body, request.headers),
    ])

    expect(world.chargeById('charge-1').status).toBe('paid')
    expect(world.paymentsFor('charge-1')).toHaveLength(1)
  })
})

describe('a link minted for the outstanding balance', () => {
  it('settles a charge that was partly paid in cash before the link went out', async () => {
    // ₪200 charge, ₪50 cash recorded, so the link was minted for ₪150 and the
    // provider reports ₪150. Validating against the ₪200 gross rejected this.
    const world = fakeDb({
      provider: 'payplus',
      charges: [{ amount: 200, amount_paid: 50 }],
      payments: [{ charge_id: 'charge-1', provider_reference: null, amount: 50 }],
    })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('payplus')
    const request = callback('payplus', 'ref-1', 150)

    await deliver('payplus', request.body, request.headers)

    expect(world.totalRecorded('charge-1')).toBe(200)
    expect(world.chargeById('charge-1')).toMatchObject({ status: 'paid', amount_paid: 200 })
  })

  it('still rejects a callback whose amount is not what the link asked for', async () => {
    const world = fakeDb({
      provider: 'payplus',
      charges: [{ amount: 200, amount_paid: 50 }],
    })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('payplus')
    const request = callback('payplus', 'ref-1', 20)

    await deliver('payplus', request.body, request.headers)

    expect(world.chargeById('charge-1').status).toBe('pending')
    expect(world.payments).toHaveLength(0)
  })
})

describe('a resent payment request', () => {
  const world = () => fakeDb({
    provider: 'cardcom',
    charges: [{ payment_reference: 'ref-new' }],
    references: [
      { charge_id: 'charge-1', payment_reference: 'ref-old', amount: 100 },
      { charge_id: 'charge-1', payment_reference: 'ref-new', amount: 100 },
    ],
  })

  it('recognises a payment made on the OLDER link', async () => {
    const w = world()
    mocks.createDb.mockReturnValue(w.db)
    useProvider('cardcom')
    const request = callback('cardcom', 'ref-old')

    await deliver('cardcom', request.body, request.headers)

    expect(w.chargeById('charge-1').status).toBe('paid')
    expect(w.totalRecorded('charge-1')).toBe(100)
  })

  it('recognises a payment made on the newer link', async () => {
    const w = world()
    mocks.createDb.mockReturnValue(w.db)
    useProvider('cardcom')
    const request = callback('cardcom', 'ref-new')

    await deliver('cardcom', request.body, request.headers)

    expect(w.chargeById('charge-1').status).toBe('paid')
    expect(w.totalRecorded('charge-1')).toBe(100)
  })

  it('takes the money once when both links are paid, and reports the second', async () => {
    const w = world()
    mocks.createDb.mockReturnValue(w.db)
    useProvider('cardcom')
    const first = callback('cardcom', 'ref-new')
    const late = callback('cardcom', 'ref-old')

    await deliver('cardcom', first.body, first.headers)
    await deliver('cardcom', late.body, late.headers)

    expect(w.totalRecorded('charge-1')).toBe(100)
    expect(w.paymentsFor('charge-1')).toHaveLength(1)
  })
})

describe('money that cannot be applied', () => {
  it('records only what is owed when more arrives than is open', async () => {
    // Gross ₪200 link, then ₪100 cash recorded, then the parent pays the ₪200
    // link: ₪300 arrives against ₪200 of debt.
    const world = fakeDb({
      provider: 'payplus',
      charges: [{ amount: 200, amount_paid: 100 }],
      references: [{ charge_id: 'charge-1', payment_reference: 'ref-1', amount: 200 }],
      payments: [{ charge_id: 'charge-1', provider_reference: null, amount: 100 }],
    })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('payplus')
    const request = callback('payplus', 'ref-1', 200)

    await deliver('payplus', request.body, request.headers)

    expect(world.totalRecorded('charge-1')).toBe(200)
    expect(world.chargeById('charge-1')).toMatchObject({ status: 'paid', amount_paid: 200 })
  })

  it('leaves a charge someone already settled by hand alone', async () => {
    const world = fakeDb({
      provider: 'cardcom',
      charges: [{ status: 'paid', amount_paid: 100 }],
      payments: [{ charge_id: 'charge-1', provider_reference: null, amount: 100 }],
    })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('cardcom')
    const request = callback('cardcom')

    await deliver('cardcom', request.body, request.headers)

    expect(world.totalRecorded('charge-1')).toBe(100)
    expect(world.paymentsFor('charge-1')).toHaveLength(1)
  })
})

describe('an environment behind on migrations', () => {
  it('refuses to mark a charge paid when the payment cannot be recorded idempotently', async () => {
    const world = fakeDb({ provider: 'cardcom', missingIdempotencyColumn: true })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('cardcom')
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
    const request = callback('cardcom')

    const response = await deliver('cardcom', request.body, request.headers)
    spy.mockRestore()

    expect(world.chargeById('charge-1').status).toBe('pending')
    expect(world.payments).toHaveLength(0)
    expect(await response.json()).toEqual({ ok: false })
    expect(errors.some((args) => String(args[0]).includes('FATAL'))).toBe(true)
  })

  it('still settles the current link when the reference history table is absent', async () => {
    const world = fakeDb({ provider: 'cardcom', missingReferenceHistory: true })
    mocks.createDb.mockReturnValue(world.db)
    useProvider('cardcom')
    const request = callback('cardcom')

    await deliver('cardcom', request.body, request.headers)

    expect(world.chargeById('charge-1').status).toBe('paid')
  })
})

describe('grow', () => {
  it('settles through the adapter confirmation instead of being rejected unread', async () => {
    const world = fakeDb({ provider: 'grow' })
    mocks.createDb.mockReturnValue(world.db)
    const confirm = vi.fn().mockResolvedValue(true)
    mocks.getProvider.mockResolvedValue({ provider: { confirmTransaction: confirm }, providerName: 'grow' })
    const request = callback('grow')

    await deliver('grow', request.body, request.headers)

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'ref-1',
        body: expect.objectContaining({ processId: 'process-1' }),
      })
    )
    expect(world.chargeById('charge-1').status).toBe('paid')
    expect(world.totalRecorded('charge-1')).toBe(100)
  })

  it('records nothing when Grow does not approve the transaction', async () => {
    const world = fakeDb({ provider: 'grow' })
    mocks.createDb.mockReturnValue(world.db)
    mocks.getProvider.mockResolvedValue({
      provider: { confirmTransaction: vi.fn().mockResolvedValue(false) },
      providerName: 'grow',
    })
    const request = callback('grow')

    await deliver('grow', request.body, request.headers)

    expect(world.chargeById('charge-1').status).toBe('pending')
    expect(world.payments).toHaveLength(0)
  })
})

describe('an owner marking the charge paid while the callback is in flight', () => {
  it('does not double-count: no provider row lands on a charge already settled by hand', async () => {
    const world = fakeDb({ provider: 'cardcom', charges: [{ amount: 200 }] })
    mocks.createDb.mockReturnValue(world.db)

    // The window is a provider round-trip. confirmTransaction stands in for it:
    // the owner taps "mark paid" while the handler waits on the network, which
    // is what markChargeAsPaid does — status paid, amount_paid full, and a
    // method:'manual' charge_payments row keyed WITHOUT a provider_reference.
    mocks.getProvider.mockResolvedValue({
      provider: {
        confirmTransaction: vi.fn().mockImplementation(async () => {
          const charge = world.chargeById('charge-1')
          charge.status = 'paid'
          charge.amount_paid = 200
          world.payments.push({ charge_id: 'charge-1', provider_reference: null, amount: 200 })
          return true
        }),
      },
      providerName: 'cardcom',
    })

    const request = callback('cardcom', 'ref-1', 200)
    await deliver('cardcom', request.body, request.headers)

    // Before the freshness re-read the handler settled against its stale
    // 'pending' snapshot and upserted a second, method:'provider' row under a
    // different unique key — 400 of charge_payments against a 200 charge,
    // invisible in `charges` because amount_paid stayed a correct 200.
    expect(world.totalRecorded('charge-1')).toBe(200)
    expect(world.paymentsFor('charge-1')).toHaveLength(1)
    expect(world.chargeById('charge-1').amount_paid).toBe(200)
  })
})
