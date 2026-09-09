import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { createNote, NOTE_LESSON_OUTSIDE_ORG } from './notes'

let inserted: Record<string, unknown> | null = null

/**
 * `lessonLookup` is what the org-scoped lesson probe finds; null means the
 * lesson is not in that org.
 */
function mockDb(lessonLookup: { id: string } | null) {
  inserted = null
  const maybeSingle = vi.fn().mockResolvedValue({ data: lessonLookup, error: null })
  const lessonsSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
  })
  const insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    inserted = row
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'n1', organization_id: row.organization_id, lesson_id: row.lesson_id,
            teacher_id: row.teacher_id, body: row.body,
            visible_to_parent: row.visible_to_parent,
            created_at: 'x', updated_at: 'x', teachers: null,
          },
          error: null,
        }),
      }),
    }
  })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) =>
      table === 'lessons' ? { select: lessonsSelect } : { insert }
    ),
  })
}

const params = {
  orgId: 'org-a',
  lessonId: 'lesson-1',
  teacherId: 'teacher-1',
  body: 'note body',
  visibleToParent: true,
}

describe('createNote tenant binding', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a lesson that is not the given org\'s', async () => {
    mockDb(null)
    await expect(createNote({ ...params, lessonId: 'lesson-of-org-b' })).rejects.toThrow(
      NOTE_LESSON_OUTSIDE_ORG
    )
    expect(inserted).toBeNull()
  })

  it('writes the note when the lesson is in the org', async () => {
    mockDb({ id: 'lesson-1' })
    const note = await createNote(params)
    expect(note.id).toBe('n1')
    expect(inserted).toMatchObject({
      organization_id: 'org-a',
      lesson_id: 'lesson-1',
      teacher_id: 'teacher-1',
      visible_to_parent: true,
    })
  })
})
