import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

import {
  getSaasPlanById,
  getSaasPlanByName,
  listActiveSaasPlans,
  listAllSaasPlans,
} from './plans'

type Filter = { column: string; value: unknown }

/**
 * A query builder that records every filter applied to it, so a test can assert
 * on the SHAPE of the query rather than on a stubbed result.
 */
function recordingQuery(result: unknown) {
  const filters: Filter[] = []
  const chain: Record<string, unknown> = {}

  chain.select = () => chain
  chain.eq = (column: string, value: unknown) => {
    filters.push({ column, value })
    return chain
  }
  chain.order = () => chain
  chain.maybeSingle = async () => result
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)

  return { chain, filters }
}

const ADVANCED_ROW = {
  id: 'plan-advanced',
  name: 'advanced',
  display_name_he: 'מתקדם',
  display_name_en: 'Advanced',
  price_monthly: 199,
  price_yearly: 1990,
  features: { whatsapp_automation: true },
  sort_order: 15,
  students_quota: null,
  lessons_monthly_quota: null,
  teachers_quota: null,
}

describe('getSaasPlanById — the grandfathering invariant', () => {
  beforeEach(() => vi.clearAllMocks())

  /**
   * READ src/lib/saas/plans.ts BEFORE "FIXING" THIS TEST.
   *
   * organization_subscriptions has no price column: every price, feature and
   * quota an org holds is resolved live through getSaasPlanById. Because that
   * lookup ignores is_active, an org whose tier was retired keeps resolving the
   * price it bought — forever. That is the entire grandfathering mechanism, and
   * what lets a repricing be "add a row, retire the old one" instead of an
   * edit that silently re-prices every existing customer.
   *
   * Adding `.eq('is_active', true)` here in the name of consistency would
   * re-price every legacy customer at their next checkout and blank their
   * features. This test exists to make that a red build rather than a refund.
   */
  it('does NOT filter is_active — a retired plan must still resolve for its holders', async () => {
    const { chain, filters } = recordingQuery({ data: ADVANCED_ROW, error: null })
    mockFrom.mockReturnValue(chain)

    const plan = await getSaasPlanById('plan-advanced')

    expect(filters.map((f) => f.column)).toEqual(['id'])
    expect(filters).not.toContainEqual({ column: 'is_active', value: true })
    expect(plan).toMatchObject({ name: 'advanced', price_monthly: 199 })
  })

  it('resolves the retired tier price, not the replacement tier price', async () => {
    const { chain } = recordingQuery({ data: ADVANCED_ROW, error: null })
    mockFrom.mockReturnValue(chain)

    const plan = await getSaasPlanById('plan-advanced')

    // Studio is ₪349. A legacy Advanced holder must still read ₪199, which is
    // what the underpayment guard in activateSubscriptionFromPayment compares
    // a payment against.
    expect(plan?.price_monthly).toBe(199)
    expect(plan?.price_yearly).toBe(1990)
  })
})

describe('getSaasPlanByName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('DOES filter is_active — a retired tier must never come back by name', async () => {
    const { chain, filters } = recordingQuery({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    await getSaasPlanByName('advanced')

    expect(filters).toContainEqual({ column: 'is_active', value: true })
  })
})

describe('catalog listings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listActiveSaasPlans hides retired tiers from pickers', async () => {
    const { chain, filters } = recordingQuery({ data: [], error: null })
    mockFrom.mockReturnValue(chain)

    await listActiveSaasPlans()

    expect(filters).toContainEqual({ column: 'is_active', value: true })
  })

  it('listAllSaasPlans includes them, so admin screens can name a legacy plan', async () => {
    const { chain, filters } = recordingQuery({ data: [], error: null })
    mockFrom.mockReturnValue(chain)

    await listAllSaasPlans()

    expect(filters).toEqual([])
  })
})
