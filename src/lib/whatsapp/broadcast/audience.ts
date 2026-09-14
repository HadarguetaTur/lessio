/**
 * Who a broadcast reaches.
 *
 * Two layers on purpose: `applyConsent` is a pure function over already-loaded
 * people (unit-tested exhaustively), and `resolveAudience` is the thin database
 * half that turns a filter into those people. The consent rules are the part
 * that must never drift — a promotion reaching a parent who did not opt in is a
 * Meta policy breach that costs the org's number its quality rating.
 *
 * Dedup is by phone: a parent of two students in the same group is one message,
 * and `broadcast_recipients` carries UNIQUE (campaign_id, phone) so a retry
 * cannot undo that.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'
import { getGroupRosterServiceRole } from '@/lib/groups/roster'
import { consentRefusal } from '@/lib/whatsapp/consentRules'
import {
  categoryOf,
  type AudienceCandidate,
  type AudienceFilter,
  type AudienceResult,
  type BroadcastCategory,
  type BroadcastRecipient,
  type BroadcastType,
  type SkipReason,
} from './types'

type Db = ReturnType<typeof createServiceRoleClient>

/**
 * Applies opt-out and opt-in rules to loaded candidates and dedupes by phone.
 *
 * The consent rule itself is `consentRefusal` in ../consentRules — the same
 * function the send path asks a second time, immediately before each message
 * goes out. What this produces is a preview and a report, never a permission:
 * a recipient materialised on Monday is not proof of consent on Tuesday.
 *
 * What is left here is the part that is genuinely about audience shape:
 *   1. no phone at all — nothing to send to
 *   2. dedup by phone
 *   3. the consent rule
 *   4. for an invite, skip anyone already invited
 */
export function applyConsent(
  candidates: AudienceCandidate[],
  category: BroadcastCategory,
  fallbackLocale: AppLocale = 'he'
): AudienceResult {
  const included: BroadcastRecipient[] = []
  const skippedCounts = new Map<SkipReason, number>()
  const seenPhones = new Set<string>()

  const skip = (reason: SkipReason) => skippedCounts.set(reason, (skippedCounts.get(reason) ?? 0) + 1)

  for (const c of candidates) {
    const phone = c.phone?.trim()
    if (!phone) {
      skip('no_phone')
      continue
    }
    // Dedup before the consent checks: the same person refused twice is one
    // skip line, not two, and one included row either way.
    if (seenPhones.has(phone)) continue
    seenPhones.add(phone)

    if (!c.isActive) {
      // An archived parent is not a policy skip — they are simply not part of
      // the audience, and saying "3 skipped" for them would be noise.
      continue
    }
    const refusal = consentRefusal(c, category)
    if (refusal) {
      skip(refusal)
      continue
    }
    if (category === 'invite' && c.alreadyInvited) {
      skip('already_invited')
      continue
    }

    included.push({
      parentId: c.parentId,
      studentId: c.studentId,
      phone,
      displayName: c.displayName,
      locale: c.locale ?? fallbackLocale,
    })
  }

  return {
    included,
    skipped: [...skippedCounts.entries()].map(([reason, count]) => ({ reason, count })),
  }
}

/** The parent columns every query below selects, in one place. */
type ParentRow = {
  id: string
  full_name: string | null
  phone: string | null
  preferred_locale: string | null
  is_active: boolean | null
  opted_out_at: string | null
  updates_opted_out_at: string | null
  marketing_opt_in_at: string | null
  marketing_opted_out_at: string | null
}

const PARENT_COLUMNS =
  'id, full_name, phone, preferred_locale, is_active, opted_out_at, updates_opted_out_at, marketing_opt_in_at, marketing_opted_out_at'

function candidateFromParent(p: ParentRow, studentId: string | null): AudienceCandidate {
  return {
    parentId: p.id,
    studentId,
    phone: p.phone,
    displayName: p.full_name,
    locale: p.preferred_locale ? parseAppLocale(p.preferred_locale) : null,
    isActive: p.is_active !== false,
    optedOutAt: p.opted_out_at,
    updatesOptedOutAt: p.updates_opted_out_at,
    marketingOptInAt: p.marketing_opt_in_at,
    marketingOptedOutAt: p.marketing_opted_out_at,
  }
}

/** Shape of the nested parent rows every student query below selects. */
type StudentWithParents = {
  id: string
  full_name: string | null
  phone: string | null
  is_active: boolean | null
  relationships: Array<{ parent: ParentRow | null }> | null
}

const STUDENT_PARENT_SELECT = `
  id,
  full_name,
  phone,
  is_active,
  relationships (
    parent:parents ( ${PARENT_COLUMNS} )
  )
`

/**
 * Every parent of these students, plus the student themselves when they carry
 * their own phone — the same rule the rest of the bot follows (docs/schema.md).
 *
 * A student's own number has no parent row behind it, so it has no consent
 * columns of its own; it inherits the org-wide opt-out only. It is listed after
 * the parents so that when both hold the same number, the parent's consent
 * state is the one that decides.
 */
function candidatesFromStudents(students: StudentWithParents[]): AudienceCandidate[] {
  const out: AudienceCandidate[] = []
  for (const s of students) {
    for (const rel of s.relationships ?? []) {
      if (rel.parent) out.push(candidateFromParent(rel.parent, s.id))
    }
    if (s.phone?.trim()) {
      out.push({
        parentId: null,
        studentId: s.id,
        phone: s.phone,
        displayName: s.full_name,
        locale: null,
        isActive: s.is_active !== false,
        optedOutAt: null,
        updatesOptedOutAt: null,
        marketingOptInAt: null,
        marketingOptedOutAt: null,
      })
    }
  }
  return out
}

async function studentsByIds(db: Db, orgId: string, ids: string[]): Promise<StudentWithParents[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('students')
    .select(STUDENT_PARENT_SELECT)
    .eq('organization_id', orgId)
    .in('id', ids)
  if (error) throw new Error(`resolveAudience(students): ${error.message}`)
  return (data ?? []) as unknown as StudentWithParents[]
}

/** The student ids a filter names, or null when the filter is not student-shaped. */
async function studentIdsFor(db: Db, orgId: string, filter: AudienceFilter): Promise<string[] | null> {
  switch (filter.kind) {
    case 'student_group': {
      const roster = await getGroupRosterServiceRole(orgId, filter.groupId)
      return roster?.studentIds ?? []
    }
    case 'lesson': {
      const { data, error } = await db
        .from('lesson_students')
        .select('student_id, lesson:lessons!inner(organization_id)')
        .eq('lesson_id', filter.lessonId)
        .eq('status', 'enrolled')
        .eq('lesson.organization_id', orgId)
      if (error) throw new Error(`resolveAudience(lesson): ${error.message}`)
      return [...new Set((data ?? []).map((r) => (r as { student_id: string }).student_id))]
    }
    case 'teacher': {
      // Every student who has a scheduled lesson with this teacher. Reading it
      // off lessons rather than a students.teacher_id column keeps it true for
      // a student taught by two teachers.
      const { data, error } = await db
        .from('lesson_students')
        .select('student_id, lesson:lessons!inner(teacher_id, organization_id, status)')
        .eq('lesson.teacher_id', filter.teacherId)
        .eq('lesson.organization_id', orgId)
        .eq('lesson.status', 'scheduled')
      if (error) throw new Error(`resolveAudience(teacher): ${error.message}`)
      return [...new Set((data ?? []).map((r) => (r as { student_id: string }).student_id))]
    }
    case 'open_debt': {
      const { data, error } = await db
        .from('charges')
        .select('student_id')
        .eq('organization_id', orgId)
        .neq('status', 'paid')
        .neq('status', 'cancelled')
      if (error) throw new Error(`resolveAudience(open_debt): ${error.message}`)
      return [
        ...new Set(
          (data ?? [])
            .map((r) => (r as { student_id: string | null }).student_id)
            .filter((id): id is string => Boolean(id))
        ),
      ]
    }
    case 'all_active': {
      const { data, error } = await db
        .from('students')
        .select('id')
        .eq('organization_id', orgId)
        .not('is_active', 'is', false)
      if (error) throw new Error(`resolveAudience(all_active): ${error.message}`)
      return (data ?? []).map((r) => (r as { id: string }).id)
    }
    case 'manual':
    case 'list':
      return null
  }
}

/**
 * Turns a filter into the people a campaign would message, with the skipped
 * ones counted by reason so the compose screen can say who will not get it and
 * why before anything is sent.
 */
export async function resolveAudience(
  orgId: string,
  filter: AudienceFilter,
  type: BroadcastType,
  opts: { fallbackLocale?: AppLocale } = {}
): Promise<AudienceResult> {
  const db = createServiceRoleClient()
  const category = categoryOf(type)

  let candidates: AudienceCandidate[]

  if (filter.kind === 'manual' || filter.kind === 'list') {
    // A saved list is a manual audience whose members live in a table rather
    // than in the campaign row — read at send time, so a parent taken off the
    // list since is not messaged.
    const parentIds = filter.kind === 'manual' ? filter.parentIds : await listMemberIds(db, orgId, filter.listId)
    if (parentIds.length === 0) return { included: [], skipped: [] }
    const { data, error } = await db
      .from('parents')
      .select(PARENT_COLUMNS)
      .eq('organization_id', orgId)
      .in('id', parentIds)
    if (error) throw new Error(`resolveAudience(${filter.kind}): ${error.message}`)
    candidates = ((data ?? []) as unknown as ParentRow[]).map((p) => candidateFromParent(p, null))
  } else {
    const studentIds = (await studentIdsFor(db, orgId, filter)) ?? []
    const students = await studentsByIds(db, orgId, studentIds)
    candidates = candidatesFromStudents(students)
  }

  // A group invite goes only to parents who have not had one yet, so adding a
  // student to the group invites that student's parent and nobody else.
  if (filter.kind === 'student_group' && filter.onlyUninvited) {
    const { data, error } = await db
      .from('student_group_invites')
      .select('parent_id')
      .eq('group_id', filter.groupId)
      .eq('organization_id', orgId)
    if (error) throw new Error(`resolveAudience(invites): ${error.message}`)
    const invited = new Set((data ?? []).map((r) => (r as { parent_id: string }).parent_id))
    candidates = candidates.map((c) => ({
      ...c,
      alreadyInvited: c.parentId ? invited.has(c.parentId) : false,
    }))
  }

  return applyConsent(candidates, category, opts.fallbackLocale ?? 'he')
}

/** The parents on a saved list, scoped to the org so a foreign list id reads as empty. */
async function listMemberIds(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  listId: string
): Promise<string[]> {
  const { data, error } = await db
    .from('broadcast_list_members')
    .select('parent_id')
    .eq('organization_id', orgId)
    .eq('list_id', listId)
  if (error) throw new Error(`resolveAudience(list): ${error.message}`)
  return (data ?? []).map((r) => (r as { parent_id: string }).parent_id)
}
