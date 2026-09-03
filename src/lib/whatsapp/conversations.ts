/**
 * Reads over the WhatsApp transcript — the conversation list and one thread.
 *
 * A conversation is a phone number, not a parent: the bot answers students,
 * teachers and strangers too, and a thread has to survive the parent record
 * being renamed or unlinked. Identity is resolved on read, from the same tables
 * resolveSender consults, so a conversation gains a name the moment the phone
 * is registered rather than staying anonymous forever.
 *
 * All access is service-role, and every query is scoped to one organization.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getActiveTakeovers, getTakeover } from './takeover'
import type { SenderRole, WaMessageKind } from './messageLog'
import type { WaLogOrigin } from './logContext'

export type ConversationSummary = {
  phone: string
  /** Registered name, or null when this phone matches nobody in the org. */
  displayName: string | null
  senderRole: SenderRole
  lastMessage: string
  lastMessageAt: string
  /** True when the last message came from them — nobody has answered it yet. */
  awaitingReply: boolean
  takenOver: boolean
}

export type ThreadMessage = {
  id: string
  isInbound: boolean
  origin: WaLogOrigin | null
  kind: WaMessageKind
  body: string
  /** Name of the staff member who sent this, when a person did. */
  senderName: string | null
  createdAt: string
}

type MessageRow = {
  id: string
  phone: string
  direction: 'in' | 'out'
  origin: WaLogOrigin | null
  sender_role: SenderRole | null
  sent_by_profile_id: string | null
  kind: WaMessageKind
  body: string
  created_at: string
}

/**
 * How far back the conversation list looks.
 *
 * A transcript grows forever, but a list of every phone that ever wrote is not
 * an inbox — it is an archive. Ninety days keeps the list to conversations
 * someone might still act on, and bounds the scan.
 */
const SUMMARY_WINDOW_DAYS = 90

/** How many rows the list scan reads before reducing to one row per phone. */
const SUMMARY_SCAN_LIMIT = 2000

/**
 * One row per conversation, newest first.
 *
 * `teacherId` narrows the list to parents of that teacher's own students —
 * the same reach /students grants them. Conversations with anyone else
 * (students, other staff, strangers) are not a teacher's to read.
 */
export async function getConversationSummaries(
  orgId: string,
  options: { teacherId?: string } = {}
): Promise<ConversationSummary[]> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - SUMMARY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('whatsapp_messages')
    .select('id, phone, direction, origin, sender_role, sent_by_profile_id, kind, body, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_SCAN_LIMIT)

  if (error) {
    console.error('[whatsapp/conversations] summaries failed', { orgId, error: error.message })
    return []
  }

  const rows = (data ?? []) as MessageRow[]

  // Rows arrive newest first, so the first one seen for a phone is its latest.
  const latest = new Map<string, MessageRow>()
  for (const row of rows) {
    if (!latest.has(row.phone)) latest.set(row.phone, row)
  }

  const phones = [...latest.keys()]
  if (phones.length === 0) return []

  const [identities, takeovers] = await Promise.all([
    resolveIdentities(orgId, phones),
    getActiveTakeovers(orgId),
  ])

  const allowed = options.teacherId
    ? await phonesReachableByTeacher(orgId, options.teacherId, phones)
    : null

  const summaries: ConversationSummary[] = []

  for (const [phone, row] of latest) {
    if (allowed && !allowed.has(phone)) continue

    const identity = identities.get(phone)

    summaries.push({
      phone,
      displayName: identity?.fullName ?? null,
      senderRole: identity?.role ?? row.sender_role ?? 'unknown',
      lastMessage: row.body,
      lastMessageAt: row.created_at,
      awaitingReply: row.direction === 'in',
      takenOver: takeovers.has(phone),
    })
  }

  return summaries.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

/** One conversation, oldest first — reading order. */
export async function getThread(
  orgId: string,
  phone: string,
  limit = 100
): Promise<ThreadMessage[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('whatsapp_messages')
    .select('id, phone, direction, origin, sender_role, sent_by_profile_id, kind, body, created_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[whatsapp/conversations] thread failed', { orgId, error: error.message })
    return []
  }

  // Fetched newest-first so the limit keeps the RECENT end of a long thread,
  // then reversed for display.
  const rows = ((data ?? []) as MessageRow[]).reverse()

  const profileIds = [...new Set(rows.map((r) => r.sent_by_profile_id).filter(Boolean))] as string[]
  const names = await resolveProfileNames(profileIds)

  return rows.map((row) => ({
    id: row.id,
    isInbound: row.direction === 'in',
    origin: row.origin,
    kind: row.kind,
    body: row.body,
    senderName: row.sent_by_profile_id ? (names.get(row.sent_by_profile_id) ?? null) : null,
    createdAt: row.created_at,
  }))
}

/** Header details for one conversation, whether or not it has any messages. */
export async function getConversationHeader(
  orgId: string,
  phone: string
): Promise<{ displayName: string | null; senderRole: SenderRole; takenOverBy: string | null; takenOver: boolean }> {
  const [identities, takeover] = await Promise.all([
    resolveIdentities(orgId, [phone]),
    getTakeover(orgId, phone),
  ])

  const identity = identities.get(phone)
  const takenByName = takeover?.takenByProfileId
    ? ((await resolveProfileNames([takeover.takenByProfileId])).get(takeover.takenByProfileId) ?? null)
    : null

  return {
    displayName: identity?.fullName ?? null,
    senderRole: identity?.role ?? 'unknown',
    takenOver: takeover !== null,
    takenOverBy: takenByName,
  }
}

/**
 * Whether a teacher may open one conversation.
 *
 * The list is filtered, but a by-phone read reached through the service-role
 * client would otherwise open any conversation in the org to anyone who typed
 * a phone number into the URL — the same hole canTeacherAccessStudent closes
 * for students.
 */
export async function canTeacherAccessPhone(
  orgId: string,
  teacherId: string,
  phone: string
): Promise<boolean> {
  const allowed = await phonesReachableByTeacher(orgId, teacherId, [phone])
  return allowed.has(phone)
}

// ── Internals ────────────────────────────────────────────────────────────────

type Identity = { role: SenderRole; fullName: string | null }

/**
 * Names a set of phones, using the same precedence as resolveSender
 * (parent > student > teacher > staff) so a conversation is labelled the way
 * the bot itself treats it.
 */
async function resolveIdentities(
  orgId: string,
  phones: string[]
): Promise<Map<string, Identity>> {
  const db = createServiceRoleClient()
  const found = new Map<string, Identity>()

  const [parents, students, teachers, staff] = await Promise.all([
    db
      .from('parents')
      .select('phone, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('phone', phones),
    db
      .from('students')
      .select('phone, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('phone', phones),
    db
      .from('teachers')
      .select('profiles!inner ( phone, full_name )')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('profiles.phone', phones),
    db
      .from('profiles')
      .select('phone, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('role', ['owner', 'admin'])
      .in('phone', phones),
  ])

  // Applied lowest precedence first, so a higher one overwrites it.
  for (const row of (staff.data ?? []) as { phone: string; full_name: string | null }[]) {
    found.set(row.phone, { role: 'staff', fullName: row.full_name })
  }
  for (const row of (teachers.data ?? []) as unknown as {
    profiles: { phone: string | null; full_name: string | null } | null
  }[]) {
    if (row.profiles?.phone) {
      found.set(row.profiles.phone, { role: 'teacher', fullName: row.profiles.full_name })
    }
  }
  for (const row of (students.data ?? []) as { phone: string; full_name: string | null }[]) {
    found.set(row.phone, { role: 'student', fullName: row.full_name })
  }
  for (const row of (parents.data ?? []) as { phone: string; full_name: string | null }[]) {
    found.set(row.phone, { role: 'parent', fullName: row.full_name })
  }

  return found
}

async function resolveProfileNames(profileIds: string[]): Promise<Map<string, string>> {
  if (profileIds.length === 0) return new Map()

  const db = createServiceRoleClient()
  const { data } = await db.from('profiles').select('id, full_name').in('id', profileIds)

  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[])
      .filter((row) => row.full_name)
      .map((row) => [row.id, row.full_name as string])
  )
}

/**
 * Of `phones`, those belonging to a parent of one of this teacher's students.
 *
 * "This teacher's students" has the same two meanings as in
 * canTeacherAccessStudent: assigned to them, or sharing a lesson with them.
 * Only parents pass — a teacher has no business reading the org's other
 * conversations, and a conversation with an unidentified number is nobody's
 * student.
 */
async function phonesReachableByTeacher(
  orgId: string,
  teacherId: string,
  phones: string[]
): Promise<Set<string>> {
  const db = createServiceRoleClient()

  const [assigned, viaLessons] = await Promise.all([
    db
      .from('students')
      .select('id')
      .eq('organization_id', orgId)
      .eq('teacher_id', teacherId),
    db
      .from('lesson_students')
      .select('student_id, lessons!inner(teacher_id, organization_id)')
      .eq('lessons.teacher_id', teacherId)
      .eq('lessons.organization_id', orgId),
  ])

  const studentIds = new Set<string>([
    ...((assigned.data ?? []) as { id: string }[]).map((r) => r.id),
    ...((viaLessons.data ?? []) as { student_id: string }[]).map((r) => r.student_id),
  ])

  if (studentIds.size === 0) return new Set()

  const { data: rels } = await db
    .from('relationships')
    .select('parent_id')
    .eq('organization_id', orgId)
    .in('student_id', [...studentIds])

  const parentIds = [...new Set(((rels ?? []) as { parent_id: string }[]).map((r) => r.parent_id))]
  if (parentIds.length === 0) return new Set()

  const { data: parents } = await db
    .from('parents')
    .select('phone')
    .eq('organization_id', orgId)
    .in('id', parentIds)
    .in('phone', phones)

  return new Set(((parents ?? []) as { phone: string }[]).map((r) => r.phone))
}
