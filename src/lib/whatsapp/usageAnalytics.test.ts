import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockDecryptToken } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: mockDecryptToken,
}))

import { getWhatsAppUsage, parseUsageDays } from './usageAnalytics'

const ORG = { whatsapp_waba_id: 'waba-1', whatsapp_access_token: 'encrypted' }

const DAY = 86_400
/** Unix start-of-day for "N days ago", so points land in the fetched window. */
function daysAgo(n: number): number {
  return Math.floor(Date.now() / 1000 / DAY - n) * DAY
}

interface Tables {
  org: unknown
  cache: { payload: unknown; fetched_at: string } | null
}

let upsertSpy: ReturnType<typeof vi.fn>

function mockDb({ org = ORG, cache = null }: Partial<Tables> = {}) {
  upsertSpy = vi.fn().mockResolvedValue({ error: null })
  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: org, error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: cache, error: null }),
        upsert: upsertSpy,
      }
    },
  })
}

function pricingResponse(
  points: Array<{ start: number; volume: number; cost?: number; category?: string; type?: string }>
) {
  return {
    ok: true,
    json: async () => ({
      pricing_analytics: {
        data: [
          {
            data_points: points.map(p => ({
              start: p.start,
              end: p.start + DAY,
              volume: p.volume,
              cost: p.cost ?? 0,
              pricing_category: p.category ?? 'UTILITY',
              pricing_type: p.type ?? 'REGULAR',
            })),
          },
        ],
      },
    }),
  }
}

describe('getWhatsAppUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecryptToken.mockReturnValue('plain-token')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aggregates pricing analytics per category, splitting free from billable', async () => {
    mockDb()
    const fetchMock = vi.fn().mockResolvedValue(
      pricingResponse([
        { start: daysAgo(2), volume: 10, cost: 1.5, category: 'UTILITY' },
        { start: daysAgo(2), volume: 4, cost: 0.8, category: 'MARKETING' },
        { start: daysAgo(1), volume: 6, cost: 0, category: 'SERVICE', type: 'FREE_CUSTOMER_SERVICE' },
        { start: daysAgo(1), volume: 2, cost: 0.1, category: 'AUTHENTICATION' },
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary).not.toBeNull()
    expect(summary!.totalMessages).toBe(22)
    expect(summary!.billableMessages).toBe(16)
    expect(summary!.freeMessages).toBe(6)
    expect(summary!.totalCostUsd).toBeCloseTo(2.4, 6)
    expect(summary!.byCategory.utility).toEqual({ volume: 10, costUsd: 1.5 })
    expect(summary!.byCategory.marketing).toEqual({ volume: 4, costUsd: 0.8 })
    expect(summary!.byCategory.service).toEqual({ volume: 6, costUsd: 0 })
    expect(summary!.byCategory.authentication).toEqual({ volume: 2, costUsd: 0.1 })
    expect(summary!.stale).toBe(false)
  })

  it('buckets points into sorted days', async () => {
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        pricingResponse([
          { start: daysAgo(1), volume: 5, cost: 0.5 },
          { start: daysAgo(3), volume: 3, cost: 0.3 },
          { start: daysAgo(1), volume: 2, cost: 0.2, category: 'MARKETING' },
        ])
      )
    )

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary!.daily).toHaveLength(2)
    expect(summary!.daily[0].date < summary!.daily[1].date).toBe(true)
    const lastDay = summary!.daily[1]
    expect(lastDay.volume).toBe(7)
    expect(lastDay.costUsd).toBeCloseTo(0.7, 6)
    expect(lastDay.byCategory.marketing).toEqual({ volume: 2, costUsd: 0.2 })
  })

  it('caches the result after fetching', async () => {
    mockDb()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pricingResponse([{ start: daysAgo(1), volume: 1 }])))

    await getWhatsAppUsage('org-1', 60)

    expect(upsertSpy).toHaveBeenCalledTimes(1)
    expect(upsertSpy.mock.calls[0][0]).toMatchObject({ organization_id: 'org-1', days: 60 })
  })

  it('serves a fresh cache row without calling Meta', async () => {
    const payload = { days: 30, totalMessages: 42, stale: false }
    mockDb({ cache: { payload, fetched_at: new Date().toISOString() } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary).toEqual(payload)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to a stale cache row when Meta is down', async () => {
    const payload = { days: 30, totalMessages: 7, stale: false }
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockDb({ cache: { payload, fetched_at: old } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary).toMatchObject({ totalMessages: 7, stale: true })
  })

  it('falls back to conversation analytics when pricing analytics errors', async () => {
    mockDb()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'unsupported field' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversation_analytics: {
            data: [
              {
                data_points: [
                  {
                    start: daysAgo(1),
                    end: daysAgo(1) + DAY,
                    conversation: 9,
                    cost: 1.2,
                    conversation_category: 'UTILITY',
                    conversation_type: 'REGULAR',
                  },
                ],
              },
            ],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('conversation_analytics')
    expect(summary!.totalMessages).toBe(9)
    expect(summary!.byCategory.utility).toEqual({ volume: 9, costUsd: 1.2 })
  })

  it('returns null and never calls Meta for an org with no WABA', async () => {
    mockDb({ org: { whatsapp_waba_id: null, whatsapp_access_token: null } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await getWhatsAppUsage('org-1', 30)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty summary — not a throw — on a malformed Meta response', async () => {
    mockDb()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nonsense: true }) }))

    const summary = await getWhatsAppUsage('org-1', 90)

    expect(summary!.totalMessages).toBe(0)
    expect(summary!.daily).toEqual([])
    expect(summary!.days).toBe(90)
  })

  it('skips data points that do not parse', async () => {
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pricing_analytics: {
            data: [
              {
                data_points: [
                  { start: daysAgo(1), end: daysAgo(1) + DAY, volume: 5, cost: 0.5, pricing_category: 'UTILITY' },
                  { garbage: true },
                ],
              },
            ],
          },
        }),
      })
    )

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary!.totalMessages).toBe(5)
  })

  it('maps an unrecognised category to "unknown" rather than dropping it', async () => {
    mockDb()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pricingResponse([{ start: daysAgo(1), volume: 3, cost: 0.3, category: 'BRAND_NEW' }]))
    )

    const summary = await getWhatsAppUsage('org-1', 30)

    expect(summary!.byCategory.unknown).toEqual({ volume: 3, costUsd: 0.3 })
    expect(summary!.totalMessages).toBe(3)
  })
})

describe('parseUsageDays', () => {
  it('accepts the supported periods and defaults to 30', () => {
    expect(parseUsageDays('30')).toBe(30)
    expect(parseUsageDays('60')).toBe(60)
    expect(parseUsageDays('90')).toBe(90)
    expect(parseUsageDays(undefined)).toBe(30)
    expect(parseUsageDays('7')).toBe(30)
    expect(parseUsageDays('drop table')).toBe(30)
  })
})
