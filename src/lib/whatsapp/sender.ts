/**
 * Inbound WhatsApp sender identity resolution.
 *
 * The webhook used to ask one question — "is this phone a parent?" — and treat
 * every other number as a cold lead. That mislabelled teachers and owners as
 * sales leads in their own CRM, and left students unrecognised on the very
 * phone the homework reminders are sent to.
 *
 * This module answers the wider question: which person in this org is this,
 * and in what capacity are they writing?
 *
 * Per /docs/decisions.md #26 — "every flow step must resolve organization
 * scope and actor identity before side effects".
 *
 * All lookups are scoped to one organization and compare against an already
 * normalized E.164 phone (see @/lib/phone). Stored phones are normalized on
 * write in the dashboard actions, so these are exact, index-friendly matches.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type SenderRole = 'parent' | 'student' | 'teacher' | 'staff' | 'unknown'

/** Roles that map to a real person; `unknown` is everything else. */
export type KnownSenderRole = Exclude<SenderRole, 'unknown'>

export type ResolvedSender =
  | {
      role: 'parent'
      parentId: string
      fullName: string | null
      preferredLocale: string | null
      /** Other capacities this phone also holds in this org, if any. */
      alsoKnownAs: KnownSenderRole[]
    }
  | {
      role: 'student'
      studentId: string
      fullName: string | null
      preferredLocale: null
      alsoKnownAs: KnownSenderRole[]
    }
  | {
      role: 'teacher'
      teacherId: string
      profileId: string
      fullName: string | null
      preferredLocale: string | null
      alsoKnownAs: KnownSenderRole[]
    }
  | {
      role: 'staff'
      profileId: string
      staffRole: 'owner' | 'admin'
      fullName: string | null
      preferredLocale: string | null
      alsoKnownAs: KnownSenderRole[]
    }
  | { role: 'unknown' }

/**
 * Precedence when one phone holds several capacities in the same org.
 *
 * Parent first is deliberate and load-bearing: before this module every
 * inbound message resolved to a parent or to nothing, so anything else first
 * would silently change the reply a teacher-who-is-also-a-parent already gets.
 * An explicit choice via whatsapp_sender_preference overrides this order.
 */
const ROLE_PRECEDENCE: readonly KnownSenderRole[] = ['parent', 'student', 'teacher', 'staff']

/** A resolved sender that is somebody — i.e. not the `unknown` variant. */
export type KnownSender = Exclude<ResolvedSender, { role: 'unknown' }>

type Candidates = Partial<Record<KnownSenderRole, KnownSender>>

/**
 * Maps an inbound phone to a person in this org.
 *
 * Returns `{ role: 'unknown' }` when the phone matches nobody — only then is
 * the sender a genuine stranger and a lead.
 */
export async function resolveSender(orgId: string, phone: string): Promise<ResolvedSender> {
  const db = createServiceRoleClient()

  // Only parents.phone is unique per org — students.phone has no constraint at
  // all and profiles.phone none either, so these deliberately take the first of
  // several rather than using maybeSingle(), which ERRORS on multiple matches.
  // Ordering by id keeps the choice stable across messages.
  const [parentRes, studentRes, teacherRes, staffRes, prefRes] = await Promise.all([
    db
      .from('parents')
      .select('id, full_name, preferred_locale')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('students')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(1),
    db
      .from('teachers')
      .select('id, profile_id, profiles!inner ( id, full_name, phone, preferred_locale )')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('profiles.phone', phone)
      .order('id', { ascending: true })
      .limit(1),
    db
      .from('profiles')
      .select('id, full_name, role, preferred_locale')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .eq('is_active', true)
      .in('role', ['owner', 'admin'])
      .order('id', { ascending: true })
      .limit(1),
    db
      .from('whatsapp_sender_preference')
      .select('role')
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .maybeSingle(),
  ])

  // A failed identity lookup must not be read as "not this role" — that would
  // downgrade a teacher to a sales lead on a transient DB error.
  for (const [label, res] of [
    ['parents', parentRes],
    ['students', studentRes],
    ['teachers', teacherRes],
    ['profiles', staffRes],
  ] as const) {
    if (res.error) {
      console.error('[whatsapp/sender] DB error resolving sender identity', {
        orgId,
        table: label,
        error: res.error,
      })
      throw new Error(`Failed to resolve inbound WhatsApp sender against ${label}`)
    }
  }

  /** First row of a limit(1) list result, or null. */
  const firstOf = <T,>(res: { data: unknown }): T | null => {
    const rows = res.data as T[] | null
    return rows && rows.length > 0 ? rows[0] : null
  }

  const studentRow = firstOf<{ id: string; full_name: string | null }>(studentRes)
  const teacherRow = firstOf<{
    id: string
    profile_id: string
    profiles: { id: string; full_name: string | null; preferred_locale: string | null } | null
  }>(teacherRes)
  const staffRow = firstOf<{
    id: string
    full_name: string | null
    role: string
    preferred_locale: string | null
  }>(staffRes)

  const candidates: Candidates = {}

  if (parentRes.data) {
    const row = parentRes.data as { id: string; full_name: string | null; preferred_locale: string | null }
    candidates.parent = {
      role: 'parent',
      parentId: row.id,
      fullName: row.full_name,
      preferredLocale: row.preferred_locale,
      alsoKnownAs: [],
    }
  }

  if (studentRow) {
    candidates.student = {
      role: 'student',
      studentId: studentRow.id,
      fullName: studentRow.full_name,
      preferredLocale: null,
      alsoKnownAs: [],
    }
  }

  if (teacherRow) {
    candidates.teacher = {
      role: 'teacher',
      teacherId: teacherRow.id,
      profileId: teacherRow.profile_id,
      fullName: teacherRow.profiles?.full_name ?? null,
      preferredLocale: teacherRow.profiles?.preferred_locale ?? null,
      alsoKnownAs: [],
    }
  }

  if (staffRow) {
    candidates.staff = {
      role: 'staff',
      profileId: staffRow.id,
      staffRole: staffRow.role === 'admin' ? 'admin' : 'owner',
      fullName: staffRow.full_name,
      preferredLocale: staffRow.preferred_locale,
      alsoKnownAs: [],
    }
  }

  const found = ROLE_PRECEDENCE.filter((r) => candidates[r] !== undefined)

  if (found.length === 0) return { role: 'unknown' }

  // An explicit "switch role" choice wins — but only while that identity still
  // exists and is active. A teacher who was deactivated falls back to the
  // normal precedence rather than to a dead menu.
  const preferred = (prefRes.data as { role: string } | null)?.role
  const chosen =
    preferred && found.includes(preferred as KnownSenderRole)
      ? (preferred as KnownSenderRole)
      : found[0]

  if (found.length > 1) {
    console.warn('[whatsapp/sender] Phone holds several capacities in one org', {
      orgId,
      roles: found,
      resolvedAs: chosen,
      viaPreference: chosen === preferred,
    })
  }

  return { ...candidates[chosen]!, alsoKnownAs: found.filter((r) => r !== chosen) }
}

/**
 * Records an explicit capacity choice for a phone that holds several.
 * Written only when the sender taps "switch role" — never inferred.
 */
export async function setSenderPreference(
  orgId: string,
  phone: string,
  role: KnownSenderRole
): Promise<void> {
  const db = createServiceRoleClient()

  const { error } = await db.from('whatsapp_sender_preference').upsert(
    {
      organization_id: orgId,
      phone,
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,phone' }
  )

  if (error) {
    console.error('[whatsapp/sender] Failed to persist sender preference', { orgId, role, error })
    throw new Error('Failed to persist WhatsApp sender preference')
  }
}

/** The display name for a resolved sender, or null when the role has none. */
export function senderFullName(sender: ResolvedSender): string | null {
  return sender.role === 'unknown' ? null : sender.fullName
}

/** The stored locale preference for a resolved sender (students have none). */
export function senderStoredLocale(sender: ResolvedSender): string | null {
  return sender.role === 'unknown' ? null : sender.preferredLocale
}
