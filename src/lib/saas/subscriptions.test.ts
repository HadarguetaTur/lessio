/**
 * Platform-billing activation guards.
 *
 * These cover the money path that a production audit (2026-08-29) found had
 * never run end to end: at the time, zero rows in organization_subscriptions
 * held a Sumit payment token and saas_invoices was empty. Every case below is a
 * way the old code handed out a paid plan for free, so each test is the
 * acceptance criterion for one fix rather than a regression net.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const store: { subs: Row[]; invoices: Row[]; orgs: Row[] } = { subs: [], invoices: [], orgs: [] }

/**
 * Minimal stand-in for the query builder: enough chaining for the two shapes
 * this module uses, plus the unique index on saas_invoices.sumit_document_id
 * (migration 20260829130100) so idempotency is exercised, not assumed.
 */
function tableFor(name: string): Row[] {
  if (name === 'saas_invoices') return store.invoices
  if (name === 'organizations') return store.orgs
  return store.subs
}

type Filter = [op: 'eq' | 'neq', col: string, val: unknown]

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, col, val]) =>
    op === 'eq' ? row[col] === val : row[col] !== val
  )
}

function makeClient() {
  return {
    from(name: string) {
      const rows = tableFor(name)
      const filters: Filter[] = []

      const selectBuilder = {
        eq(col: string, val: unknown) {
          filters.push(['eq', col, val])
          return selectBuilder
        },
        maybeSingle() {
          return Promise.resolve({ data: rows.find((r) => matches(r, filters)) ?? null, error: null })
        },
      }

      return {
        select: () => selectBuilder,
        update(patch: Row) {
          const apply = () => {
            const hit = rows.filter((r) => matches(r, filters))
            hit.forEach((r) => Object.assign(r, patch))
            return { data: hit, error: null }
          }
          // A PostgREST builder is thenable at every stage, so callers may await
          // it with or without .select(). revertPendingCheckout does the former.
          const updateBuilder = {
            eq(col: string, val: unknown) {
              filters.push(['eq', col, val])
              return updateBuilder
            },
            neq(col: string, val: unknown) {
              filters.push(['neq', col, val])
              return updateBuilder
            },
            select: () => Promise.resolve(apply()),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(apply()).then(resolve, reject),
          }
          return updateBuilder
        },
        insert(row: Row) {
          const docId = row.sumit_document_id
          if (docId != null && rows.some((r) => r.sumit_document_id === docId)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
          }
          rows.push({ ...row })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => makeClient() }))
vi.mock('./plans', () => ({ getSaasPlanById: vi.fn(), getSaasPlanByName: vi.fn() }))

import {
  activateSubscriptionFromPayment,
  isOrgSaasReadOnly,
  pastDueGraceDaysLeft,
  revertPendingCheckout,
  PAST_DUE_GRACE_DAYS,
  type OrgSubscriptionState,
} from './subscriptions'
import { getSaasPlanById, getSaasPlanByName, type SaasPlanRow } from './plans'
import { decryptSaasPaymentToken } from '@/lib/crypto'

const ORG = 'org-1'
const REF = 'ref-aaaa-bbbb'

/**
 * The RETIRED ₪199 tier, kept as the fixture on purpose: these tests are what
 * prove a grandfathered customer still resolves the price they bought after the
 * seat-priced catalog landed. Typed `: SaasPlanRow` so a new plan column is a
 * compile error here rather than a silently-undefined field.
 */
const ADVANCED: SaasPlanRow = {
  id: 'plan-advanced',
  name: 'advanced',
  display_name_he: 'מתקדם',
  display_name_en: 'Advanced',
  price_monthly: 199,
  price_yearly: 1990,
  features: {
    whatsapp_automation: true,
    ai_assistant: true,
    full_reports: true,
    leads: true,
    homework: true,
    parent_portal: true,
    integrations: true,
    data_retention: true,
  },
  sort_order: 15,
  students_quota: null,
  lessons_monthly_quota: null,
  teachers_quota: null,
}

function pendingRow(overrides: Row = {}): Row {
  return {
    id: 'sub-1',
    organization_id: ORG,
    plan_id: ADVANCED.id,
    status: 'pending_payment',
    billing_interval: 'monthly',
    pending_checkout_reference: REF,
    previous_status: null,
    previous_plan_id: null,
    ...overrides,
  }
}

function activate(overrides: Partial<Parameters<typeof activateSubscriptionFromPayment>[0]> = {}) {
  return activateSubscriptionFromPayment({
    orgId: ORG,
    checkoutReference: REF,
    paidAmount: 199,
    sumitPaymentToken: 'tok_live_1',
    invoice: { amount: 199, sumitDocumentId: 'doc-1' },
    ...overrides,
  })
}

beforeEach(() => {
  store.subs = []
  store.invoices = []
  store.orgs = [{ id: ORG, service_state: 'suspended', service_state_changed_at: null }]
  vi.mocked(getSaasPlanById).mockResolvedValue(ADVANCED)
  vi.mocked(getSaasPlanByName).mockResolvedValue(null)
})

describe('activateSubscriptionFromPayment', () => {
  it('activates a pending checkout and records one invoice', async () => {
    store.subs.push(pendingRow())

    const result = await activate()

    expect(result).toEqual({ activated: true })
    expect(store.subs[0].status).toBe('active')
    expect(store.subs[0].pending_checkout_reference).toBeNull()
    expect(store.invoices).toHaveLength(1)
  })

  it('stores the card token encrypted, never as plaintext', async () => {
    // The row is SELECTable by the org's own owner and admin through the
    // browser publishable key, and this token can be replayed to charge the
    // stored card — so what lands in the column must not be readable.
    store.subs.push(pendingRow())

    await activate()

    const stored = store.subs[0].sumit_payment_token as string
    expect(stored).not.toBe('tok_live_1')
    expect(stored).not.toContain('tok_live_1')
    expect(stored.split(':')).toHaveLength(3) // iv:ciphertext:authTag
    expect(decryptSaasPaymentToken(stored)).toBe('tok_live_1')
  })

  // A suspended org that pays should not sit silent until the next cron run:
  // the bot, the sending crons and the parent portal all read service_state.
  it('turns the service back on immediately on payment', async () => {
    store.subs.push(pendingRow())

    await activate()

    expect(store.orgs[0].service_state).toBe('active')
    expect(store.orgs[0].service_state_changed_at).not.toBeNull()
  })

  it('leaves service_state alone when the activation is refused', async () => {
    store.subs.push(pendingRow())

    await activate({ checkoutReference: 'ref-from-another-org' })

    expect(store.orgs[0].service_state).toBe('suspended')
  })

  // The callback is a GET page. Re-opening its URL used to add a month and a
  // second "paid" invoice row every single time — a free subscription forever.
  it('refuses a replay of the same callback URL', async () => {
    store.subs.push(pendingRow())
    await activate()
    const periodEndAfterFirst = store.subs[0].current_period_end

    const replay = await activate()

    expect(replay).toEqual({ activated: false, reason: 'no_pending_subscription' })
    expect(store.subs[0].current_period_end).toBe(periodEndAfterFirst)
    expect(store.invoices).toHaveLength(1)
  })

  // A valid payment id belonging to a different org used to activate the
  // caller's own subscription, because only "a row exists" was checked.
  it("refuses another org's payment reference", async () => {
    store.subs.push(pendingRow())

    const result = await activate({ checkoutReference: 'ref-from-another-org' })

    expect(result).toEqual({ activated: false, reason: 'reference_mismatch' })
    expect(store.subs[0].status).toBe('pending_payment')
  })

  // A ₪1 payment used to unlock advanced.
  it('refuses a payment below the plan price', async () => {
    store.subs.push(pendingRow())

    const result = await activate({ paidAmount: 1, invoice: { amount: 1 } })

    expect(result).toEqual({ activated: false, reason: 'amount_below_plan_price' })
    expect(store.subs[0].status).toBe('pending_payment')
  })

  it('accepts a few agorot under the price rather than failing on rounding', async () => {
    store.subs.push(pendingRow())

    const result = await activate({ paidAmount: 198.99 })

    expect(result).toEqual({ activated: true })
  })

  /**
   * Grandfathering, end to end.
   *
   * ADVANCED is the RETIRED ₪199 tier. Its replacement, Studio, is ₪349. A
   * customer who bought Advanced must keep being charged — and validated
   * against — ₪199, because getSaasPlanById resolves their plan row regardless
   * of is_active and there is no price stored on the subscription.
   *
   * If a future change filters is_active in getSaasPlanById, or a repricing
   * edits a row in place instead of adding one, this pair of assertions is what
   * catches it before a customer is silently overcharged.
   */
  it('still honours the retired tier price for a customer who bought it', async () => {
    store.subs.push(pendingRow())

    const atLegacyPrice = await activate({ paidAmount: 199, invoice: { amount: 199 } })

    expect(atLegacyPrice).toEqual({ activated: true })
    expect(store.subs[0].status).toBe('active')
  })

  it('does not quietly hold a legacy customer to the replacement tier price', async () => {
    store.subs.push(pendingRow())

    // ₪149 is the new entry tier. It is below ₪199, so it must still be
    // refused — the legacy row, not the new catalog, is the reference point.
    const result = await activate({ paidAmount: 149, invoice: { amount: 149 } })

    expect(result).toEqual({ activated: false, reason: 'amount_below_plan_price' })
  })

  // Was always +1 month, so ₪1,990/year bought 30 days.
  it('gives a yearly checkout a year, not a month', async () => {
    store.subs.push(pendingRow({ billing_interval: 'yearly' }))

    await activate({ paidAmount: 1990, invoice: { amount: 1990, sumitDocumentId: 'doc-y' } })

    const start = new Date(store.subs[0].current_period_start as string)
    const end = new Date(store.subs[0].current_period_end as string)
    expect(end.getFullYear() - start.getFullYear()).toBe(1)
    expect(end.getMonth()).toBe(start.getMonth())
  })

  it('activates monthly for a monthly checkout', async () => {
    store.subs.push(pendingRow())

    await activate()

    const start = new Date(store.subs[0].current_period_start as string)
    const end = new Date(store.subs[0].current_period_end as string)
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    expect(months).toBe(1)
  })

  // The webhook and the redirect callback can land together. Only one may win.
  it('is idempotent across the webhook/callback race', async () => {
    store.subs.push(pendingRow())

    const [first, second] = await Promise.all([activate(), activate()])

    expect([first.activated, second.activated].filter(Boolean)).toHaveLength(1)
    expect(store.invoices).toHaveLength(1)
  })

  it('does nothing for an org with no subscription row', async () => {
    const result = await activate()
    expect(result).toEqual({ activated: false, reason: 'no_pending_subscription' })
  })
})

describe('revertPendingCheckout', () => {
  // Cancelling used to DELETE the row, and an org with no row reads as
  // grandfathered: every feature flag true, no quota, dashboard open.
  it('restores a trialling org instead of deleting its subscription', async () => {
    store.subs.push(
      pendingRow({ previous_status: 'trial', previous_plan_id: 'plan-free' })
    )

    await revertPendingCheckout(ORG)

    expect(store.subs).toHaveLength(1)
    expect(store.subs[0].status).toBe('trial')
    expect(store.subs[0].plan_id).toBe('plan-free')
    expect(store.subs[0].pending_checkout_reference).toBeNull()
  })

  // A paying customer who starts an upgrade and changes their mind must not be
  // dropped to free.
  it('restores an active paid subscription after an abandoned upgrade', async () => {
    store.subs.push(
      pendingRow({ previous_status: 'active', previous_plan_id: 'plan-basic' })
    )

    await revertPendingCheckout(ORG)

    expect(store.subs[0].status).toBe('active')
    expect(store.subs[0].plan_id).toBe('plan-basic')
  })

  it('leaves a non-pending subscription untouched', async () => {
    store.subs.push(pendingRow({ status: 'active', pending_checkout_reference: null }))

    await revertPendingCheckout(ORG)

    expect(store.subs[0].status).toBe('active')
  })
})

describe('isOrgSaasReadOnly', () => {
  const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

  function state(overrides: Partial<OrgSubscriptionState>): OrgSubscriptionState {
    return {
      subscriptionId: 'sub-1',
      planId: ADVANCED.id,
      planName: 'advanced',
      status: 'active',
      billingInterval: 'monthly',
      trialEndsAt: null,
      currentPeriodEnd: daysFromNow(20),
      cancelAtPeriodEnd: false,
      cardLastFour: null,
      features: ADVANCED.features,
      ...overrides,
    }
  }

  it('leaves an active subscription writable', () => {
    expect(isOrgSaasReadOnly(state({}))).toBe(false)
  })

  // The daily checker set these states and nothing consumed them: a cancelled
  // org kept the full product forever.
  it('locks a cancelled subscription', () => {
    expect(isOrgSaasReadOnly(state({ status: 'cancelled' }))).toBe(true)
  })

  it('keeps a past_due org working inside the grace window', () => {
    const s = state({ status: 'past_due', currentPeriodEnd: daysFromNow(-1) })
    expect(isOrgSaasReadOnly(s)).toBe(false)
    expect(pastDueGraceDaysLeft(s)).toBe(PAST_DUE_GRACE_DAYS - 1)
  })

  it('locks a past_due org once the grace window is over', () => {
    const s = state({ status: 'past_due', currentPeriodEnd: daysFromNow(-PAST_DUE_GRACE_DAYS - 1) })
    expect(isOrgSaasReadOnly(s)).toBe(true)
    expect(pastDueGraceDaysLeft(s)).toBe(0)
  })

  // Locking someone out because a timestamp is missing is the worse failure.
  it('does not lock a past_due org with no recorded period end', () => {
    expect(isOrgSaasReadOnly(state({ status: 'past_due', currentPeriodEnd: null }))).toBe(false)
  })

  it('still treats an org with no subscription row as unrestricted', () => {
    expect(isOrgSaasReadOnly(null)).toBe(false)
  })
})
