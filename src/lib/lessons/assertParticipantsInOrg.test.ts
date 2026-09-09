/**
 * Cross-tenant participants on the owner/admin lesson paths (SCHED-03).
 *
 * The teacher sub-shell always checked this; the owner/admin branches never
 * did. Both entry points now go through the lib layer, so the guard cannot be
 * forgotten by a new caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertParticipantsInOrg, ParticipantNotInOrgError } from './assertParticipantsInOrg'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

const ORG_A = 'org-a'
const TEACHER_OF_A = 'teacher-a'
const STUDENT_OF_A = 'student-a'
const STUDENT_2_OF_A = 'student-a2'
const TEACHER_OF_B = 'teacher-b'
const STUDENT_OF_B = 'student-b'

interface Recorded {
  table: string
  filters: Record<string, unknown>
}
let recorded: Recorded[]

/**
 * `known` is what the org actually owns. The fake answers from the filters as
 * they arrive, so a query that forgot `.eq('organization_id', …)` returns
 * nothing rather than quietly matching another tenant's row.
 */
function wire(known: { teachers: string[]; students: string[] }) {
  mockFrom.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    recorded.push({ table, filters })
    const self: Record<string, unknown> = {}
    const record = (method: string) => (column: string, value: unknown) => {
      filters[`${method}:${column}`] = value
      return self
    }
    self['select'] = () => self
    self['eq'] = record('eq')
    self['in'] = record('in')

    const resolve = () => {
      if (filters['eq:organization_id'] !== ORG_A) return { data: null, error: null }
      if (table === 'teachers') {
        const id = filters['eq:id'] as string
        return { data: known.teachers.includes(id) ? { id } : null, error: null }
      }
      const ids = (filters['in:id'] as string[]) ?? []
      return { data: ids.filter((i) => known.students.includes(i)).map((id) => ({ id })), error: null }
    }

    self['maybeSingle'] = () => Promise.resolve(resolve())
    self['single'] = () => Promise.resolve(resolve())
    self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res)
    return self
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  recorded = []
  wire({ teachers: [TEACHER_OF_A], students: [STUDENT_OF_A, STUDENT_2_OF_A] })
})

describe('assertParticipantsInOrg', () => {
  it('passes for a teacher and students the org owns', async () => {
    await expect(
      assertParticipantsInOrg(ORG_A, TEACHER_OF_A, [STUDENT_OF_A, STUDENT_2_OF_A])
    ).resolves.toBeUndefined()
  })

  it('refuses a teacher from another org', async () => {
    // The sharp one: no_teacher_lesson_overlap is keyed on teacher_id alone,
    // org-agnostically, so a lesson written here would make that hour
    // permanently unbookable in the other tenant.
    await expect(
      assertParticipantsInOrg(ORG_A, TEACHER_OF_B, [STUDENT_OF_A])
    ).rejects.toMatchObject({ name: 'ParticipantNotInOrgError', participant: 'teacher' })
  })

  it('refuses a student from another org', async () => {
    await expect(
      assertParticipantsInOrg(ORG_A, TEACHER_OF_A, [STUDENT_OF_B])
    ).rejects.toMatchObject({ name: 'ParticipantNotInOrgError', participant: 'student' })
  })

  it('refuses the whole roster when one id of several is foreign', async () => {
    await expect(
      assertParticipantsInOrg(ORG_A, TEACHER_OF_A, [STUDENT_OF_A, STUDENT_OF_B])
    ).rejects.toBeInstanceOf(ParticipantNotInOrgError)
  })

  it('scopes both lookups to the caller-resolved org, never a client-supplied one', async () => {
    await assertParticipantsInOrg(ORG_A, TEACHER_OF_A, [STUDENT_OF_A])

    for (const q of recorded) {
      expect(q.filters['eq:organization_id']).toBe(ORG_A)
    }
    expect(recorded.map((q) => q.table)).toEqual(['teachers', 'students'])
  })

  it('does not query students at all when the roster is empty', async () => {
    await assertParticipantsInOrg(ORG_A, TEACHER_OF_A, [])
    expect(recorded.map((q) => q.table)).toEqual(['teachers'])
  })
})
