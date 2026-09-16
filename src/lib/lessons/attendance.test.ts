import { describe, expect, it } from 'vitest'
import { isStudentAbsent, normalizeOutcome } from './attendance'

describe('isStudentAbsent', () => {
  it('reads a no_show lesson as absent for everyone, marked or not', () => {
    expect(isStudentAbsent('no_show', null)).toBe(true)
  })

  it('reads an unmarked completed lesson as present', () => {
    expect(isStudentAbsent('completed', null)).toBe(false)
    expect(isStudentAbsent('completed', 'present')).toBe(false)
    expect(isStudentAbsent('completed', 'absent')).toBe(true)
  })

  it('never calls a scheduled or cancelled lesson an absence', () => {
    expect(isStudentAbsent('scheduled', 'absent')).toBe(false)
    expect(isStudentAbsent('cancelled', 'absent')).toBe(false)
  })
})

describe('normalizeOutcome', () => {
  const roster = ['s1', 's2']

  it('derives no_show when the explicit list is empty', () => {
    const out = normalizeOutcome({ status: 'completed', rosterStudentIds: roster, presentStudentIds: [] })
    expect(out.status).toBe('no_show')
    expect([...out.attendance!]).toEqual([['s1', 'absent'], ['s2', 'absent']])
  })

  it('derives completed when anyone came, even if no_show was picked', () => {
    const out = normalizeOutcome({ status: 'no_show', rosterStudentIds: roster, presentStudentIds: ['s2', 'intruder'] })
    expect(out.status).toBe('completed')
    expect([...out.attendance!]).toEqual([['s1', 'absent'], ['s2', 'present']])
  })

  it('marks the whole roster absent for a bare no_show', () => {
    expect([...normalizeOutcome({ status: 'no_show', rosterStudentIds: roster }).attendance!]).toEqual([
      ['s1', 'absent'], ['s2', 'absent'],
    ])
  })

  it('leaves attendance alone for a bare completed', () => {
    expect(normalizeOutcome({ status: 'completed', rosterStudentIds: roster }).attendance).toBeNull()
  })
})
