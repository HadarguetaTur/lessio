import { describe, expect, it } from 'vitest'
import { discoveryQueries, isCollectable } from './discovery'

describe('discovery collection', () => {
  it('anchors every query on a subject and rotates city and subject by day', () => {
    const monday = discoveryQueries(new Date('2026-09-14T09:00:00Z'))
    const tuesday = discoveryQueries(new Date('2026-09-15T09:00:00Z'))
    expect(monday).toHaveLength(4)
    for (const query of [...monday, ...tuesday]) expect(query).toMatch(/מתמטיקה|אנגלית|פיזיקה/)
    expect(monday).not.toEqual(tuesday)
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
