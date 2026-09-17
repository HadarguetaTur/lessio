import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoveryQueries, isCollectable, searchPlaces } from './discovery'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('discovery collection', () => {
  it('anchors every query on a subject and covers four cities a day', () => {
    const monday = discoveryQueries(new Date('2026-09-14T09:00:00Z'))
    const tuesday = discoveryQueries(new Date('2026-09-15T09:00:00Z'))
    expect(monday).toHaveLength(8)
    for (const query of [...monday, ...tuesday]) expect(query).toMatch(/מתמטיקה|אנגלית|פיזיקה|הוראה מתקנת/)
    expect(monday.filter((query) => tuesday.includes(query))).toEqual([])
  })
  it('does not revisit a city for at least two weeks', () => {
    const cityOf = (query: string) => query.replace(/^(הכנה לבגרות מתמטיקה|שיעורים פרטיים \S+|מרכז למידה \S+|הוראה מתקנת) /, '')
    const seen = new Set<string>()
    for (let day = 0; day < 14; day++) {
      const cities = new Set(discoveryQueries(new Date(Date.UTC(2026, 8, 14 + day, 9))).map(cityOf))
      expect(cities.size).toBe(4)
      for (const city of cities) { expect(seen.has(city)).toBe(false); seen.add(city) }
    }
  })
  it('follows the next-page token and stops after two pages', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key')
    const bodies: { pageToken?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ places: [{ id: 'p' + bodies.length, displayName: { text: 'מרכז למידה' } }], nextPageToken: 'token-' + bodies.length }))
    }))
    const places = await searchPlaces('שיעורים פרטיים מתמטיקה רעננה')
    expect(places.map((place) => place.id)).toEqual(['p1', 'p2'])
    expect(bodies.map((body) => body.pageToken)).toEqual([undefined, 'token-1'])
  })
  it('drops off-target Google types and names before they reach the research queue', () => {
    const place = (text: string, primaryType?: string) => ({ displayName: { text }, primaryType })
    expect(isCollectable(place('מרכז הלמידה של רועי גבע'))).toBe(true)
    expect(isCollectable(place('מני פורת- מורה פרטי', 'school'))).toBe(true)
    expect(isCollectable(place('מתמטי-קל', 'service'))).toBe(true)
    expect(isCollectable(place('סטודיו נעים', 'gym'))).toBe(false)
    expect(isCollectable(place('המרכז לקידום למידה', 'medical_clinic'))).toBe(false)
    expect(isCollectable(place('האוניברסיטה הפתוחה', 'university'))).toBe(false)
    expect(isCollectable(place('מורה לנהיגה שי', 'educational_institution'))).toBe(false)
  })
})
