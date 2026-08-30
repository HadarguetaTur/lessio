import { describe, it, expect, vi } from 'vitest'
import { syncOrgHolidays } from './syncOrgHolidays'

const ORG_ID = 'org-1'

type MockDbState = {
  defaultLocale: string | null
  dismissals: Array<{ date: string }>
}

function buildMockDb(state: MockDbState) {
  const upsert = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ id: 'x' }],
      error: null,
    }),
  })

  const from = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { default_locale: state.defaultLocale }, error: null }),
          }),
        }),
      }
    }
    if (table === 'organization_holiday_dismissals') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ data: state.dismissals, error: null }),
          }),
        }),
      }
    }
    if (table === 'organization_holidays') {
      return { upsert }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { db: { from } as never, upsert }
}

describe('syncOrgHolidays', () => {
  it('upserts auto rows with ignoreDuplicates on (organization_id, date)', async () => {
    const { db, upsert } = buildMockDb({ defaultLocale: 'he', dismissals: [] })

    await syncOrgHolidays(db, ORG_ID, { from: '2026-08-30' })

    expect(upsert).toHaveBeenCalledOnce()
    const [rows, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'organization_id,date', ignoreDuplicates: true })
    expect(rows.length).toBeGreaterThanOrEqual(15)
    for (const row of rows) {
      expect(row).toMatchObject({ organization_id: ORG_ID, source: 'auto' })
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('excludes dismissed dates so deleted holidays are never resurrected', async () => {
    const yomKippur = '2026-09-21'
    const { db, upsert } = buildMockDb({
      defaultLocale: 'he',
      dismissals: [{ date: yomKippur }],
    })

    await syncOrgHolidays(db, ORG_ID, { from: '2026-08-30' })

    const [rows] = upsert.mock.calls[0]
    const dates = rows.map((r: { date: string }) => r.date)
    expect(dates).not.toContain(yomKippur)
    expect(dates).toContain('2026-09-12') // Rosh Hashana still synced
  })

  it('uses English names for an en org', async () => {
    const { db, upsert } = buildMockDb({ defaultLocale: 'en', dismissals: [] })

    await syncOrgHolidays(db, ORG_ID, { from: '2026-08-30' })

    const [rows] = upsert.mock.calls[0]
    const names = rows.map((r: { name: string }) => r.name)
    expect(names).toContain('Yom Kippur')
    expect(names).not.toContain('יום כיפור')
  })

  it('falls back to Hebrew when default_locale is null', async () => {
    const { db, upsert } = buildMockDb({ defaultLocale: null, dismissals: [] })

    await syncOrgHolidays(db, ORG_ID, { from: '2026-08-30' })

    const [rows] = upsert.mock.calls[0]
    const names = rows.map((r: { name: string }) => r.name)
    expect(names).toContain('יום כיפור')
  })
})
