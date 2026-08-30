import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'
import type { EntityType, ValidatedRow } from './validators'
import { markMissingLessonDependencies } from './lessonDependencies'

/**
 * Detect duplicate rows against existing DB records.
 * Enriches each matching row with `existingId` / `existingStudentId` / `existingParentId` and warnings.
 *
 * @param studentNotFoundWarning Optional fn(name) → warning string for unresolvable student_names in parent import.
 */
export async function detectDuplicates(
  orgId: string,
  entityType: EntityType,
  rows: ValidatedRow[],
  existingRecordWarning: string,
  studentNotFoundWarning?: (name: string) => string,
  /**
   * Appended to `existingRecordWarning` to say which record matched. Hardcoding
   * these produced a half-Hebrew warning on an otherwise translated string.
   */
  roleSuffix?: { parent: string; parent2: string; student: string },
  lessonDependencyMessages?: {
    teacherNotFound: (name: string) => string
    studentNotFound: (name: string) => string
  }
): Promise<ValidatedRow[]> {
  switch (entityType) {
    case 'parents':
      return detectParentDuplicates(orgId, rows, existingRecordWarning, studentNotFoundWarning)
    case 'teachers':
      return detectTeacherDuplicates(orgId, rows, existingRecordWarning)
    case 'students':
      return detectStudentDuplicates(orgId, rows, existingRecordWarning)
    case 'family-list':
      return detectFamilyListDuplicates(orgId, rows, existingRecordWarning, roleSuffix)
    case 'lessons-schedule':
    case 'lessons-history':
      return detectLessonDependencies(orgId, rows, lessonDependencyMessages)
    default:
      return rows
  }
}

async function detectLessonDependencies(
  orgId: string,
  rows: ValidatedRow[],
  messages?: {
    teacherNotFound: (name: string) => string
    studentNotFound: (name: string) => string
  }
): Promise<ValidatedRow[]> {
  if (!messages) return rows

  const db = createServiceRoleClient()
  const [{ data: teachers }, { data: students }] = await Promise.all([
    db
      .from('teachers')
      .select('id, profile:profiles(full_name)')
      .eq('organization_id', orgId)
      .eq('is_active', true),
    db.from('students').select('id, full_name').eq('organization_id', orgId),
  ])

  return markMissingLessonDependencies(
    rows,
    (teachers ?? []).map((teacher) => ({
      id: teacher.id,
      name: (teacher.profile as unknown as { full_name: string } | null)?.full_name ?? '',
    })),
    (students ?? []).map((student) => ({ id: student.id, name: student.full_name })),
    messages
  )
}

async function detectParentDuplicates(
  orgId: string,
  rows: ValidatedRow[],
  existingRecordWarning: string,
  studentNotFoundWarning?: (name: string) => string,
  /**
   * Appended to `existingRecordWarning` to say which record matched. Hardcoding
   * these produced a half-Hebrew warning on an otherwise translated string.
   */
  roleSuffix?: { parent: string; parent2: string; student: string }
): Promise<ValidatedRow[]> {
  const phoneToRow = new Map<string, number[]>()

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].data.phone
    if (!raw) continue
    try {
      const normalized = normalizePhone(raw)
      const indices = phoneToRow.get(normalized) ?? []
      indices.push(i)
      phoneToRow.set(normalized, indices)
    } catch {
      // Phone normalization failed — will be caught during execute
    }
  }

  if (phoneToRow.size === 0) return rows

  const phones = Array.from(phoneToRow.keys())

  const db = createServiceRoleClient()
  const { data: existing } = await db
    .from('parents')
    .select('id, phone')
    .eq('organization_id', orgId)
    .in('phone', phones)

  if (!existing || existing.length === 0) return rows

  const phoneToId = new Map(existing.map((p) => [p.phone, p.id]))

  let enriched: ValidatedRow[] = rows.map((row): ValidatedRow => {
    const raw = row.data.phone
    if (!raw) return row
    try {
      const normalized = normalizePhone(raw)
      const existingId = phoneToId.get(normalized)
      if (existingId) {
        return {
          ...row,
          existingId,
          warnings: [...row.warnings, existingRecordWarning],
          status: row.status === 'error' ? 'error' : 'warning',
        }
      }
    } catch {
      // skip
    }
    return row
  })

  // Validate student_names against existing students and surface unresolvable names as warnings
  if (studentNotFoundWarning) {
    const allNames = enriched.flatMap((row) => {
      const raw = row.data.student_names || row.data.student_name
      if (!raw) return []
      return raw.split(',').map((n) => n.trim()).filter(Boolean)
    })

    if (allNames.length > 0) {
      const db = createServiceRoleClient()
      const { data: students } = await db
        .from('students')
        .select('id, full_name')
        .eq('organization_id', orgId)

      const nameSet = new Set<string>()
      for (const s of students ?? []) {
        nameSet.add(s.full_name)
        nameSet.add(s.full_name.toLowerCase())
        nameSet.add(s.full_name.trim().toLowerCase())
      }

      enriched = enriched.map((row): ValidatedRow => {
        const raw = row.data.student_names || row.data.student_name
        if (!raw) return row
        const names = raw.split(',').map((n) => n.trim()).filter(Boolean)
        const notFound = names.filter(
          (n) => !nameSet.has(n) && !nameSet.has(n.toLowerCase()) && !nameSet.has(n.trim().toLowerCase())
        )
        if (notFound.length === 0) return row
        const newWarnings = notFound.map((n) => studentNotFoundWarning(n))
        return {
          ...row,
          warnings: [...row.warnings, ...newWarnings],
          status: row.status === 'error' ? 'error' : 'warning',
        }
      })
    }
  }

  return enriched
}

async function detectTeacherDuplicates(
  orgId: string,
  rows: ValidatedRow[],
  existingRecordWarning: string
): Promise<ValidatedRow[]> {
  const emails = rows
    .map((r) => r.data.email?.trim().toLowerCase())
    .filter((e): e is string => !!e)

  if (emails.length === 0) return rows

  const db = createServiceRoleClient()
  const { data: existing } = await db
    .from('profiles')
    .select('id, email:auth_email')
    .eq('organization_id', orgId)
    .eq('role', 'teacher')

  if (!existing || existing.length === 0) return rows

  const emailToId = new Map<string, string>()
  for (const profile of existing) {
    const email = (profile as unknown as { email: string | null }).email
    if (email) emailToId.set(email.toLowerCase(), profile.id)
  }

  return rows.map((row) => {
    const email = row.data.email?.trim().toLowerCase()
    if (!email) return row
    const existingId = emailToId.get(email)
    if (existingId) {
      return {
        ...row,
        existingId,
        warnings: [...row.warnings, existingRecordWarning],
        status: row.status === 'error' ? 'error' : 'warning',
      }
    }
    return row
  })
}

async function detectStudentDuplicates(
  orgId: string,
  rows: ValidatedRow[],
  existingRecordWarning: string
): Promise<ValidatedRow[]> {
  const names = rows
    .map((r) => r.data.full_name?.trim())
    .filter((n): n is string => !!n)

  if (names.length === 0) return rows

  const db = createServiceRoleClient()
  const { data: existing } = await db
    .from('students')
    .select('id, full_name')
    .eq('organization_id', orgId)

  if (!existing || existing.length === 0) return rows

  const nameToId = new Map<string, string>()
  for (const s of existing) {
    nameToId.set(s.full_name, s.id)
    nameToId.set(s.full_name.toLowerCase(), s.id)
    nameToId.set(s.full_name.trim().toLowerCase(), s.id)
  }

  return rows.map((row) => {
    const name = row.data.full_name?.trim()
    if (!name) return row
    const existingId = nameToId.get(name) ?? nameToId.get(name.toLowerCase())
    if (existingId) {
      return {
        ...row,
        existingId,
        warnings: [...row.warnings, existingRecordWarning],
        status: row.status === 'error' ? 'error' : 'warning',
      }
    }
    return row
  })
}

async function detectFamilyListDuplicates(
  orgId: string,
  rows: ValidatedRow[],
  existingRecordWarning: string,
  roleSuffix?: { parent: string; parent2: string; student: string }
): Promise<ValidatedRow[]> {
  const db = createServiceRoleClient()

  // Collect phones for parent lookup
  const phones: string[] = []
  for (const row of rows) {
    try {
      if (row.data.parent_phone) phones.push(normalizePhone(row.data.parent_phone))
    } catch { /* skip */ }
    try {
      if (row.data.parent_phone_2) phones.push(normalizePhone(row.data.parent_phone_2))
    } catch { /* skip */ }
  }

  // Collect student names for student lookup
  const studentNames = rows
    .map((r) => r.data.student_name?.trim())
    .filter((n): n is string => !!n)

  const [{ data: existingParents }, { data: existingStudents }] = await Promise.all([
    phones.length > 0
      ? db.from('parents').select('id, phone').eq('organization_id', orgId).in('phone', phones)
      : Promise.resolve({ data: [] }),
    studentNames.length > 0
      ? db.from('students').select('id, full_name').eq('organization_id', orgId)
      : Promise.resolve({ data: [] }),
  ])

  const phoneToParentId = new Map((existingParents ?? []).map((p) => [p.phone, p.id]))

  const nameToStudentId = new Map<string, string>()
  for (const s of existingStudents ?? []) {
    nameToStudentId.set(s.full_name, s.id)
    nameToStudentId.set(s.full_name.toLowerCase(), s.id)
    nameToStudentId.set(s.full_name.trim().toLowerCase(), s.id)
  }

  return rows.map((row) => {
    let enriched: ValidatedRow = { ...row }
    const warnings: string[] = [...row.warnings]

    // Check parent
    try {
      if (row.data.parent_phone) {
        const phone = normalizePhone(row.data.parent_phone)
        const parentId = phoneToParentId.get(phone)
        if (parentId) {
          enriched = { ...enriched, existingParentId: parentId }
          warnings.push(`${existingRecordWarning}${roleSuffix?.parent ?? ''}`)
        }
      }
    } catch { /* skip */ }

    // Check second parent
    try {
      if (row.data.parent_phone_2) {
        const phone2 = normalizePhone(row.data.parent_phone_2)
        const parentId2 = phoneToParentId.get(phone2)
        if (parentId2) {
          warnings.push(`${existingRecordWarning}${roleSuffix?.parent2 ?? ''}`)
        }
      }
    } catch { /* skip */ }

    // Check student
    const studentName = row.data.student_name?.trim()
    if (studentName) {
      const studentId =
        nameToStudentId.get(studentName) ?? nameToStudentId.get(studentName.toLowerCase())
      if (studentId) {
        enriched = { ...enriched, existingStudentId: studentId }
        warnings.push(`${existingRecordWarning}${roleSuffix?.student ?? ''}`)
      }
    }

    if (warnings.length === row.warnings.length) return enriched
    return {
      ...enriched,
      warnings,
      status: row.status === 'error' ? 'error' : ('warning' as const),
    }
  })
}
