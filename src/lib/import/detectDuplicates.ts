import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import type { EntityType, ValidatedRow } from './validators'

/**
 * Detect duplicate rows against existing DB records.
 * Enriches each matching row with `existingId` and a warning.
 */
export async function detectDuplicates(
  orgId: string,
  entityType: EntityType,
  rows: ValidatedRow[]
): Promise<ValidatedRow[]> {
  switch (entityType) {
    case 'parents':
      return detectParentDuplicates(orgId, rows)
    case 'teachers':
      return detectTeacherDuplicates(orgId, rows)
    case 'students':
      return detectStudentDuplicates(orgId, rows)
    default:
      return rows
  }
}

async function detectParentDuplicates(
  orgId: string,
  rows: ValidatedRow[]
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

  return rows.map((row, i) => {
    const raw = row.data.phone
    if (!raw) return row
    try {
      const normalized = normalizePhone(raw)
      const existingId = phoneToId.get(normalized)
      if (existingId) {
        return {
          ...row,
          existingId,
          warnings: [...row.warnings, 'רשומה קיימת במערכת'],
          status: row.status === 'error' ? 'error' : 'warning',
        }
      }
    } catch {
      // skip
    }
    return row
  })
}

async function detectTeacherDuplicates(
  orgId: string,
  rows: ValidatedRow[]
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
        warnings: [...row.warnings, 'רשומה קיימת במערכת'],
        status: row.status === 'error' ? 'error' : 'warning',
      }
    }
    return row
  })
}

async function detectStudentDuplicates(
  orgId: string,
  rows: ValidatedRow[]
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
        warnings: [...row.warnings, 'רשומה קיימת במערכת'],
        status: row.status === 'error' ? 'error' : 'warning',
      }
    }
    return row
  })
}
