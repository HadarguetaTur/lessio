/**
 * Cross-tenant regression tests for lesson creation.
 *
 * An owner/admin posted teacher_id and student_ids straight from the new-lesson
 * form. Neither createLesson nor createLessonSeries checked them against the
 * org, so org A could mint a lesson naming org B's teacher and org B's
 * student — and B's student then appeared by name in A's schedule and billing.
 *
 * The scheduling workstream wrote a second, equivalent guard
 * (`assertParticipantsInOrg`) at the same choke point. Integration kept this
 * one, because it is built on the shared `@/lib/auth/orgScope` helpers rather
 * than a bespoke query; the two cases that only the other suite pinned are
 * carried over at the bottom of this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { assertLessonPeopleBelongToOrg } from './assertLessonPeople'
import { ORG_SCOPE_VIOLATION } from '@/lib/auth/orgScope'

/** Every org-scoped lookup the helper actually issued, in order. */
let recorded: { table: string; orgId: string }[] = []

/**
 * `inOrg` lists the ids that genuinely belong to org-a, per table. Anything
 * else comes back as no row, which is what a foreign id looks like to an
 * org-scoped query.
 */
function mockOrg(inOrg: { teachers: string[]; students: string[] }) {
  mockCreateServiceRoleClient.mockImplementation(() => ({
    from: (table: 'teachers' | 'students') => ({
      select: () => ({
        eq: (_c: string, orgId: string) => {
          recorded.push({ table, orgId })
          return {
            in: (_c2: string, ids: string[]) =>
              Promise.resolve({
                data:
                  orgId === 'org-a'
                    ? ids.filter((i) => inOrg[table].includes(i)).map((id) => ({ id }))
                    : [],
                error: null,
              }),
          }
        },
      }),
    }),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  recorded = []
  mockOrg({ teachers: ['teacher-a'], students: ['student-a1', 'student-a2'] })
})

describe('assertLessonPeopleBelongToOrg', () => {
  it("org A cannot name org B's teacher", async () => {
    await expect(
      assertLessonPeopleBelongToOrg('org-a', 'teacher-of-org-b', ['student-a1'])
    ).rejects.toThrow(ORG_SCOPE_VIOLATION)
  })

  it("org A cannot name org B's student", async () => {
    await expect(
      assertLessonPeopleBelongToOrg('org-a', 'teacher-a', ['student-of-org-b'])
    ).rejects.toThrow(ORG_SCOPE_VIOLATION)
  })

  it('rejects a roster whole when one student among several is foreign', async () => {
    // Not silently trimmed to the valid ones — the request was for a roster
    // the caller was not entitled to, and half-honouring it is worse.
    await expect(
      assertLessonPeopleBelongToOrg('org-a', 'teacher-a', [
        'student-a1',
        'student-of-org-b',
        'student-a2',
      ])
    ).rejects.toThrow(ORG_SCOPE_VIOLATION)
  })

  it('allows a teacher and roster genuinely in the org', async () => {
    await expect(
      assertLessonPeopleBelongToOrg('org-a', 'teacher-a', ['student-a1', 'student-a2'])
    ).resolves.toBeUndefined()
  })

  it('checks the teacher before the roster, so a foreign teacher alone is enough', async () => {
    await expect(
      assertLessonPeopleBelongToOrg('org-a', 'teacher-of-org-b', ['student-a1', 'student-a2'])
    ).rejects.toThrow(ORG_SCOPE_VIOLATION)
  })

  it('scopes both lookups to the caller-resolved org, never a client-supplied one', async () => {
    // The sharp consequence of missing this is not data theft but denial of
    // service: no_teacher_lesson_overlap is an EXCLUDE keyed on teacher_id
    // alone, with no org predicate, so a lesson written in org A against org
    // B's teacher makes that hour permanently unbookable in org B.
    await assertLessonPeopleBelongToOrg('org-a', 'teacher-a', ['student-a1'])

    expect(recorded.every((q) => q.orgId === 'org-a')).toBe(true)
    expect(recorded.map((q) => q.table)).toEqual(['teachers', 'students'])
  })

  it('does not query students at all when the roster is empty', async () => {
    await assertLessonPeopleBelongToOrg('org-a', 'teacher-a', [])
    expect(recorded.map((q) => q.table)).toEqual(['teachers'])
  })
})
