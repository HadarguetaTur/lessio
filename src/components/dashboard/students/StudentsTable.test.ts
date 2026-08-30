import { describe, expect, it } from 'vitest'
import { getStudentStatusBadge } from './StudentsTable'

const t = (key: string) => key.split('.').pop() ?? key

describe('getStudentStatusBadge', () => {
  it('uses a visible active badge style for active students', () => {
    const badge = getStudentStatusBadge('active', t)

    expect(badge.label).toBe('active')
    expect(badge.className).toContain('emerald')
  })

  it('keeps the inactive label distinct for archived students', () => {
    const badge = getStudentStatusBadge('inactive', t)

    expect(badge.label).toBe('inactive')
    expect(badge.className).toContain('slate')
  })
})
