import { describe, expect, it } from 'vitest'
import { matchesSearch, phoneDigits, searchable } from './text'

describe('searchable', () => {
  it('folds case and collapses whitespace', () => {
    expect(searchable('  Dana   Cohen ')).toBe('dana cohen')
    expect(searchable(null)).toBe('')
  })
})

describe('phoneDigits', () => {
  it('strips formatting and folds +972 to a leading zero', () => {
    expect(phoneDigits('+972-50-123-4567')).toBe('0501234567')
    expect(phoneDigits('050 123 4567')).toBe('0501234567')
    expect(phoneDigits(undefined)).toBe('')
  })
})

describe('matchesSearch', () => {
  const target = { names: ['דנה כהן', 'Noa Levi'], phones: ['+972501234567', null] }

  it('matches everything on an empty term', () => {
    expect(matchesSearch('', target)).toBe(true)
    expect(matchesSearch('   ', target)).toBe(true)
  })

  it('matches a name substring regardless of case or spacing', () => {
    expect(matchesSearch('כהן', target)).toBe(true)
    expect(matchesSearch('noa  levi', target)).toBe(true)
    expect(matchesSearch('Yossi', target)).toBe(false)
  })

  it('matches a phone fragment in either local or international form', () => {
    expect(matchesSearch('050-123', target)).toBe(true)
    expect(matchesSearch('+972 50', target)).toBe(true)
    expect(matchesSearch('054', target)).toBe(false)
  })

  it('does not treat a non-digit term as a phone match', () => {
    expect(matchesSearch('abc', { phones: ['0501234567'] })).toBe(false)
  })
})
