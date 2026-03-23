import { beforeEach, describe, it, expect, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

import { pickPrimaryParent, resolveBillingParent, MissingPrimaryParentError } from './resolveBillingParent'

const STUDENT_ID = 'student-uuid-1'

describe('pickPrimaryParent', () => {
  describe('happy path', () => {
    it('returns parent_id when one primary parent exists', () => {
      const relationships = [
        { parent_id: 'parent-1', is_primary: true },
        { parent_id: 'parent-2', is_primary: false },
      ]
      expect(pickPrimaryParent(relationships, STUDENT_ID)).toBe('parent-1')
    })

    it('returns correct parent_id when primary is not the first in list', () => {
      const relationships = [
        { parent_id: 'parent-1', is_primary: false },
        { parent_id: 'parent-2', is_primary: true },
      ]
      expect(pickPrimaryParent(relationships, STUDENT_ID)).toBe('parent-2')
    })

    it('works with a single primary parent and no other parents', () => {
      const relationships = [{ parent_id: 'parent-only', is_primary: true }]
      expect(pickPrimaryParent(relationships, STUDENT_ID)).toBe('parent-only')
    })
  })

  describe('missing primary parent', () => {
    it('throws MissingPrimaryParentError when no relationships exist', () => {
      expect(() => pickPrimaryParent([], STUDENT_ID)).toThrow(MissingPrimaryParentError)
    })

    it('throws MissingPrimaryParentError when all parents are is_primary=false', () => {
      const relationships = [
        { parent_id: 'parent-1', is_primary: false },
        { parent_id: 'parent-2', is_primary: false },
      ]
      expect(() => pickPrimaryParent(relationships, STUDENT_ID)).toThrow(MissingPrimaryParentError)
    })

    it('error message includes the student ID', () => {
      expect(() => pickPrimaryParent([], STUDENT_ID)).toThrow(STUDENT_ID)
    })

    it('error name is MissingPrimaryParentError', () => {
      try {
        pickPrimaryParent([], STUDENT_ID)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(MissingPrimaryParentError)
        expect((e as Error).name).toBe('MissingPrimaryParentError')
      }
    })
  })
})

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach((method) => {
    self[method] = pass
  })
  self['then'] = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return self
}

describe('resolveBillingParent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads relationships from the database and returns the primary parent', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          { parent_id: 'parent-1', is_primary: false },
          { parent_id: 'parent-2', is_primary: true },
        ],
        error: null,
      })
    )

    await expect(resolveBillingParent(STUDENT_ID, 'org-1')).resolves.toBe('parent-2')
    expect(mockFrom).toHaveBeenCalledWith('relationships')
  })

  it('throws a wrapped error when the relationships query fails', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: null,
        error: { message: 'db is down' },
      })
    )

    await expect(resolveBillingParent(STUDENT_ID, 'org-1')).rejects.toThrow(
      'Failed to fetch relationships: db is down'
    )
  })
})
