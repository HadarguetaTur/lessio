import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
}))

import { resolveSender, setSenderPreference } from './sender'

const ORG = 'org-1'
const PHONE = '+972501234567'

/**
 * Chainable query stub. `maybeSingle()` and awaiting the builder both resolve to
 * `result` — parents/preference use the former, the non-unique lookups the latter.
 */
function chain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'in', 'order', 'limit', 'update', 'insert', 'upsert'].forEach((m) => {
    self[m] = pass
  })
  self['maybeSingle'] = () => Promise.resolve(result)
  self['single'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return self
}

const EMPTY = { data: null, error: null }

/** Routes each table to its own canned result; anything unlisted comes back empty. */
function mockTables(tables: Record<string, unknown>) {
  mockFrom.mockImplementation((table: string) => chain(tables[table] ?? EMPTY))
}

// parents is unique on (organization_id, phone) → a single row.
const PARENT_ROW = { data: { id: 'p-1', full_name: 'דנה כהן', preferred_locale: 'he' }, error: null }
// The rest have no uniqueness → list results.
const STUDENT_ROW = { data: [{ id: 's-1', full_name: 'יעל כהן' }], error: null }
const TEACHER_ROW = {
  data: [
    {
      id: 't-1',
      profile_id: 'pr-1',
      profiles: { id: 'pr-1', full_name: 'מיכל לוי', preferred_locale: 'en' },
    },
  ],
  error: null,
}
const STAFF_ROW = {
  data: [{ id: 'pr-9', full_name: 'הדר', role: 'owner', preferred_locale: 'he' }],
  error: null,
}

describe('resolveSender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves a parent', async () => {
    mockTables({ parents: PARENT_ROW })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({
      role: 'parent',
      parentId: 'p-1',
      fullName: 'דנה כהן',
      preferredLocale: 'he',
      alsoKnownAs: [],
    })
  })

  it('resolves a student — the phone the homework reminders are sent to', async () => {
    mockTables({ students: STUDENT_ROW })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({ role: 'student', studentId: 's-1', fullName: 'יעל כהן' })
    // Students have no preferred_locale column; language comes from each message.
    expect(sender).toMatchObject({ preferredLocale: null })
  })

  it('resolves a teacher through their profile', async () => {
    mockTables({ teachers: TEACHER_ROW })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({
      role: 'teacher',
      teacherId: 't-1',
      profileId: 'pr-1',
      fullName: 'מיכל לוי',
      preferredLocale: 'en',
    })
  })

  it('resolves an owner as staff', async () => {
    mockTables({ profiles: STAFF_ROW })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({ role: 'staff', profileId: 'pr-9', staffRole: 'owner' })
  })

  it('resolves an admin as staff', async () => {
    mockTables({
      profiles: { data: [{ ...STAFF_ROW.data[0], role: 'admin' }], error: null },
    })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({ role: 'staff', staffRole: 'admin' })
  })

  it('returns unknown when the phone matches nobody', async () => {
    mockTables({})
    expect(await resolveSender(ORG, PHONE)).toEqual({ role: 'unknown' })
  })

  it('treats an empty list result as no match', async () => {
    mockTables({ students: { data: [], error: null }, profiles: { data: [], error: null } })
    expect(await resolveSender(ORG, PHONE)).toEqual({ role: 'unknown' })
  })

  /**
   * students.phone and profiles.phone have no uniqueness constraint, so two rows
   * can share a phone. maybeSingle() would ERROR on that; taking the first row
   * ordered by id resolves the same way on every message instead.
   */
  it('takes the first row when two students share a phone', async () => {
    mockTables({
      students: {
        data: [
          { id: 's-1', full_name: 'יעל כהן' },
          { id: 's-2', full_name: 'נועם כהן' },
        ],
        error: null,
      },
    })
    const sender = await resolveSender(ORG, PHONE)

    expect(sender).toMatchObject({ role: 'student', studentId: 's-1' })
  })

  describe('collisions', () => {
    it('prefers parent over teacher, and reports the other capacity', async () => {
      mockTables({ parents: PARENT_ROW, teachers: TEACHER_ROW })
      const sender = await resolveSender(ORG, PHONE)

      // Parent first preserves the reply a teacher-who-is-also-a-parent already got.
      expect(sender).toMatchObject({ role: 'parent', alsoKnownAs: ['teacher'] })
    })

    it('prefers parent over student', async () => {
      mockTables({ parents: PARENT_ROW, students: STUDENT_ROW })
      const sender = await resolveSender(ORG, PHONE)

      expect(sender).toMatchObject({ role: 'parent', alsoKnownAs: ['student'] })
    })

    it('prefers teacher over staff for an owner who also teaches', async () => {
      mockTables({ teachers: TEACHER_ROW, profiles: STAFF_ROW })
      const sender = await resolveSender(ORG, PHONE)

      expect(sender).toMatchObject({ role: 'teacher', alsoKnownAs: ['staff'] })
    })

    it('lists every other capacity held', async () => {
      mockTables({
        parents: PARENT_ROW,
        students: STUDENT_ROW,
        teachers: TEACHER_ROW,
        profiles: STAFF_ROW,
      })
      const sender = await resolveSender(ORG, PHONE)

      expect(sender).toMatchObject({
        role: 'parent',
        alsoKnownAs: ['student', 'teacher', 'staff'],
      })
    })
  })

  describe('stored preference', () => {
    it('overrides the default precedence', async () => {
      mockTables({
        parents: PARENT_ROW,
        teachers: TEACHER_ROW,
        whatsapp_sender_preference: { data: { role: 'teacher' }, error: null },
      })
      const sender = await resolveSender(ORG, PHONE)

      expect(sender).toMatchObject({ role: 'teacher', alsoKnownAs: ['parent'] })
    })

    it('is ignored when that identity is no longer held', async () => {
      // The teacher record was deactivated since the choice was made.
      mockTables({
        parents: PARENT_ROW,
        whatsapp_sender_preference: { data: { role: 'teacher' }, error: null },
      })
      const sender = await resolveSender(ORG, PHONE)

      expect(sender).toMatchObject({ role: 'parent' })
    })

    it('does not resurrect an unknown sender', async () => {
      mockTables({
        whatsapp_sender_preference: { data: { role: 'parent' }, error: null },
      })
      expect(await resolveSender(ORG, PHONE)).toEqual({ role: 'unknown' })
    })
  })

  describe('DB errors', () => {
    // A failed lookup must not read as "not this role" — that would downgrade a
    // teacher to a sales lead on a transient error.
    it.each(['parents', 'students', 'teachers', 'profiles'])('throws when %s errors', async (table) => {
      mockTables({ [table]: { data: null, error: { message: 'db down' } } })

      await expect(resolveSender(ORG, PHONE)).rejects.toThrow(
        `Failed to resolve inbound WhatsApp sender against ${table}`
      )
    })

    it('tolerates a failed preference lookup', async () => {
      mockTables({
        parents: PARENT_ROW,
        whatsapp_sender_preference: { data: null, error: { message: 'db down' } },
      })

      // The preference is a convenience; precedence still resolves the sender.
      expect(await resolveSender(ORG, PHONE)).toMatchObject({ role: 'parent' })
    })
  })
})

describe('setSenderPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts on (organization_id, phone)', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ upsert })

    await setSenderPreference(ORG, PHONE, 'teacher')

    expect(mockFrom).toHaveBeenCalledWith('whatsapp_sender_preference')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: ORG, phone: PHONE, role: 'teacher' }),
      { onConflict: 'organization_id,phone' }
    )
  })

  it('throws when the write fails', async () => {
    mockFrom.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'nope' } }) })

    await expect(setSenderPreference(ORG, PHONE, 'parent')).rejects.toThrow(
      'Failed to persist WhatsApp sender preference'
    )
  })
})
