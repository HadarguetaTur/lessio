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

type Provider = 'stripe' | 'payplus' | 'cardcom'

function callback(provider: Provider, reference = 'ref-1'): { body: string; headers: HeadersInit } {
  if (provider === 'stripe') {
    return {
      body: JSON.stringify({
        id: 'evt-1', type: 'checkout.session.completed',
        data: { object: {
          id: reference, payment_status: 'paid', amount_total: 10000,
          client_reference_id: 'charge-1',
        } },
      }),
      headers: { 'content-type': 'application/json', 'stripe-signature': 'test' },
    }
  }
  if (provider === 'payplus') {
    return {
      body: JSON.stringify({
        payment_request_uid: reference, status: 'success', amount: 100, more_info: 'charge-1',
      }),
      headers: { 'content-type': 'application/json', hash: 'test', 'user-agent': 'PayPlus' },
    }
  }
  return {
    body: new URLSearchParams({ lowProfileCode: reference, ResponseCode: '0' }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  }
}

function statefulDb(provider: Provider) {
  const state = { status: 'pending', payments: 0, mutations: 0 }
  const providerPayments = new Set<string>()
  const charge = {
    id: 'charge-1', organization_id: 'org-1', amount: 100, amount_paid: 0,
    parent_id: 'parent-1', payment_reference: 'ref-1',
  }

  class Query {
    table: string
    action = 'select'
    values: Record<string, unknown> = {}
    filters: Record<string, unknown> = {}
    constructor(table: string) { this.table = table }
    select() { return this }
    update(values: Record<string, unknown>) { this.action = 'update'; this.values = values; return this }
    insert(values: Record<string, unknown>) { this.action = 'insert'; this.values = values; return this }
    upsert(values: Record<string, unknown>) { this.action = 'insert'; this.values = values; return this }
    eq(column: string, value: unknown) { this.filters[column] = value; return this }
    in() { return this }
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
    async execute(): Promise<{ data: unknown; error: null }> {
      if (this.table === 'organizations') {
        return { data: { payment_provider: provider }, error: null }
      }
      if (this.table === 'charges' && this.action === 'select') {
        if (this.filters.payment_reference !== charge.payment_reference) return { data: [], error: null }
        return { data: [{ ...charge, status: state.status }], error: null }
      }
      if (this.table === 'charges' && this.action === 'update') {
        if ('provider_transaction_ids' in this.values) return { data: null, error: null }
        if (this.filters.status !== state.status) return { data: [], error: null }
        state.status = String(this.values.status)
        state.mutations += 1
        return { data: [{ id: charge.id }], error: null }
      }
      if (this.table === 'charge_payments' && this.action === 'insert') {
        const key = `${String(this.values.charge_id)}:${String(this.values.provider_reference)}`
        if (!providerPayments.has(key)) {
          providerPayments.add(key)
          state.payments += 1
          state.mutations += 1
        }
      }
      return { data: null, error: null }
    }
  }

  return { db: { from: (table: string) => new Query(table) }, state }
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
    const { db, state } = statefulDb(provider)
    mocks.createDb.mockReturnValue(db)
    mocks.getProvider.mockResolvedValue({
      provider: provider === 'cardcom'
        ? { confirmTransaction: vi.fn().mockResolvedValue(false) }
        : { verifyWebhookRequest: vi.fn().mockReturnValue(false) },
      providerName: provider,
    })
    const request = callback(provider)

    await deliver(provider, request.body, request.headers)

    expect(state).toMatchObject({ status: 'pending', payments: 0, mutations: 0 })
    expect(mocks.issueReceipt).not.toHaveBeenCalled()
  })

  it('records one payment when the same valid callback is delivered twice', async () => {
    const { db, state } = statefulDb(provider)
    mocks.createDb.mockReturnValue(db)
    mocks.getProvider.mockResolvedValue({
      provider: provider === 'cardcom'
        ? { confirmTransaction: vi.fn().mockResolvedValue(true) }
        : { verifyWebhookRequest: vi.fn().mockReturnValue(true) },
      providerName: provider,
    })
    const request = callback(provider)

    await deliver(provider, request.body, request.headers)
    await deliver(provider, request.body, request.headers)

    expect(state.status).toBe('paid')
    expect(state.payments).toBe(1)
  })

  it('records one payment when duplicate valid callbacks arrive concurrently', async () => {
    const { db, state } = statefulDb(provider)
    mocks.createDb.mockReturnValue(db)
    mocks.getProvider.mockResolvedValue({
      provider: provider === 'cardcom'
        ? { confirmTransaction: vi.fn().mockResolvedValue(true) }
        : { verifyWebhookRequest: vi.fn().mockReturnValue(true) },
      providerName: provider,
    })
    const request = callback(provider)

    await Promise.all([
      deliver(provider, request.body, request.headers),
      deliver(provider, request.body, request.headers),
    ])

    expect(state.status).toBe('paid')
    expect(state.payments).toBe(1)
  })
})
