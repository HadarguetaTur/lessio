/**
 * Portal slot-lock release (SCHED-07).
 *
 * The action scoped the update to `id` + `organization_id` only, on the
 * service-role client. Every parent in the org shares that scope, so any of
 * them could expire a lock belonging to another family — dropping the slot out
 * from under a booking that was one tap from confirming.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordingClient } from '@/test/supabase'

const { mockGetPortalSession, mockRequirePortalFeature, mockCreateServiceRoleClient } = vi.hoisted(
  () => ({
    mockGetPortalSession: vi.fn(),
    mockRequirePortalFeature: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
  })
)

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('@/lib/portal/session', () => ({ getPortalSession: mockGetPortalSession }))
vi.mock('@/lib/portal/features', () => ({ requirePortalFeature: mockRequirePortalFeature }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { portalReleaseSlotLockAction } from './actions'

const ORG_ID = '00000000-0000-4000-8000-0000000000c1'
const PARENT_A = '00000000-0000-4000-8000-0000000000a1'
const CHILD_OF_A = '00000000-0000-4000-8000-0000000000a2'
const OTHER_FAMILYS_LOCK = '00000000-0000-4000-8000-0000000000b9'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPortalSession.mockResolvedValue({ orgId: ORG_ID, parentId: PARENT_A })
  mockRequirePortalFeature.mockResolvedValue(undefined)
})

describe('portalReleaseSlotLockAction', () => {
  it('narrows the release to the calling parent’s own children', async () => {
    const db = recordingClient({ data: { relationships: [{ student_id: CHILD_OF_A }] } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await portalReleaseSlotLockAction(ORG_ID, OTHER_FAMILYS_LOCK)

    // The lock id alone is not authorisation. The update must also be pinned to
    // a student this parent is actually related to.
    expect(db.filters('slot_locks')).toMatchObject({
      'eq:id': OTHER_FAMILYS_LOCK,
      'eq:organization_id': ORG_ID,
      'eq:status': 'active',
      'in:student_id': [CHILD_OF_A],
    })
  })

  it('resolves the parent’s children from the session, never from an argument', async () => {
    const db = recordingClient({ data: { relationships: [{ student_id: CHILD_OF_A }] } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await portalReleaseSlotLockAction(ORG_ID, OTHER_FAMILYS_LOCK)

    expect(db.filters('relationships')).toMatchObject({
      'eq:parent_id': PARENT_A,
      'eq:organization_id': ORG_ID,
    })
  })

  it('touches nothing at all for a parent with no children in the org', async () => {
    const db = recordingClient({ data: { relationships: [] } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await portalReleaseSlotLockAction(ORG_ID, OTHER_FAMILYS_LOCK)

    expect(db.tables()).not.toContain('slot_locks')
  })

  it('bounces a session that belongs to a different org', async () => {
    mockGetPortalSession.mockResolvedValue({ orgId: 'some-other-org', parentId: PARENT_A })
    const db = recordingClient({ data: { relationships: [{ student_id: CHILD_OF_A }] } })
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await expect(portalReleaseSlotLockAction(ORG_ID, OTHER_FAMILYS_LOCK)).rejects.toThrow(
      'NEXT_REDIRECT'
    )
    expect(db.tables()).toEqual([])
  })
})
