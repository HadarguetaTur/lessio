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
import type { OutboundDeliveryStatus, SenderRole, WaMessageKind } from './messageLog'
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
  /** Who is holding the conversation, when someone is. */
  takenOverBy: string | null
  takenOverByProfileId: string | null
  /** Who sent the last message, so the preview line can say "🤖 bot:" or "you:". */
  lastOrigin: WaLogOrigin | null
  lastInbound: boolean
  lastDeliveryStatus: OutboundDeliveryStatus | null
  lastErrorCode: number | null
  /**
   * Meta's 24h customer-service window. Resolved for the whole list in one
   * query rather than per row — the inbox needs it on every line to show which
   * conversations can be answered freely.
   */
  windowOpen: boolean
  /** Set when this phone belongs to a parent. Drives the closed-window send. */
  parentId: string | null
  /** Facts the rail turns into tags. Empty for a phone that is nobody's parent. */
  studentNames: string[]
  teacherNames: string[]
  groupNames: string[]
  optedOut: boolean
  hasOpenDebt: boolean
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
  /** Outbound only: what Meta reported last. Null on inbound. */
  deliveryStatus: OutboundDeliveryStatus | null
  /** Meta's error code when deliveryStatus is 'failed'. */
  errorCode: number | null
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
  status: string
  error_code: number | null
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
    .select('id, phone, direction, origin, sender_role, sent_by_profile_id, kind, body, status, error_code, created_at')
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

  const [identities, takeovers, openWindows] = await Promise.all([
    resolveIdentities(orgId, phones),
    getActiveTakeovers(orgId),
    phonesInSessionWindow(orgId, phones),
  ])

  const allowed = options.teacherId
    ? await phonesReachableByTeacher(orgId, options.teacherId, phones)
    : null

  // Only the phones that survive the teacher filter are worth resolving facts
  // for, and only parents have any.
  const visiblePhones = phones.filter((phone) => !allowed || allowed.has(phone))
  const [facts, takenByNames] = await Promise.all([
    resolveParentFacts(orgId, visiblePhones, identities),
    resolveProfileNames([
      ...new Set(
        [...takeovers.values()].map((t) => t.takenByProfileId).filter((id): id is string => Boolean(id))
      ),
    ]),
  ])

  const summaries: ConversationSummary[] = []

  for (const [phone, row] of latest) {
    if (allowed && !allowed.has(phone)) continue

    const identity = identities.get(phone)
    const takeover = takeovers.get(phone)
    const fact = facts.get(phone)

    summaries.push({
      phone,
      displayName: identity?.fullName ?? null,
      senderRole: identity?.role ?? row.sender_role ?? 'unknown',
      lastMessage: row.body,
      lastMessageAt: row.created_at,
      awaitingReply: row.direction === 'in',
      takenOver: takeover !== undefined,
      takenOverBy: takeover?.takenByProfileId
        ? (takenByNames.get(takeover.takenByProfileId) ?? null)
        : null,
      takenOverByProfileId: takeover?.takenByProfileId ?? null,
      lastOrigin: row.origin,
      lastInbound: row.direction === 'in',
      lastDeliveryStatus: row.direction === 'out' ? (row.status as OutboundDeliveryStatus) : null,
      lastErrorCode: row.direction === 'out' ? (row.error_code ?? null) : null,
      windowOpen: openWindows.has(phone),
      parentId: fact?.parentId ?? null,
      studentNames: fact?.studentNames ?? [],
      teacherNames: fact?.teacherNames ?? [],
      groupNames: fact?.groupNames ?? [],
      optedOut: fact?.optedOut ?? false,
      hasOpenDebt: fact?.hasOpenDebt ?? false,
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
    .select('id, phone, direction, origin, sender_role, sent_by_profile_id, kind, body, status, error_code, created_at')
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
    deliveryStatus: row.direction === 'out' ? (row.status as OutboundDeliveryStatus) : null,
    errorCode: row.direction === 'out' ? (row.error_code ?? null) : null,
  }))
}

export type ConversationHeader = {
  displayName: string | null
  senderRole: SenderRole
  takenOver: boolean
  takenOverBy: string | null
  takenOverByProfileId: string | null
  /** When the hold lapses on its own. Null when nobody holds it. */
  takenOverUntil: string | null
  /**
   * Set only for a parent. The closed-window composer needs it to address a
   * one-person campaign, and its absence is why students and strangers get an
   * explanation there instead of a form.
   */
  parentId: string | null
  studentNames: string[]
  optedOut: boolean
}

/** Header details for one conversation, whether or not it has any messages. */
export async function getConversationHeader(
  orgId: string,
  phone: string
): Promise<ConversationHeader> {
  const [identities, takeover] = await Promise.all([
    resolveIdentities(orgId, [phone]),
    getTakeover(orgId, phone),
  ])

  const identity = identities.get(phone)
  const [takenByName, facts] = await Promise.all([
    takeover?.takenByProfileId
      ? resolveProfileNames([takeover.takenByProfileId]).then(
          (names) => names.get(takeover.takenByProfileId as string) ?? null
        )
      : Promise.resolve(null),
    resolveParentFacts(orgId, [phone], identities),
  ])

  const fact = facts.get(phone)

  return {
    displayName: identity?.fullName ?? null,
    senderRole: identity?.role ?? 'unknown',
    takenOver: takeover !== null,
    takenOverBy: takenByName,
    takenOverByProfileId: takeover?.takenByProfileId ?? null,
    takenOverUntil: takeover?.expiresAt ?? null,
    parentId: fact?.parentId ?? null,
    studentNames: fact?.studentNames ?? [],
    optedOut: fact?.optedOut ?? false,
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

type Identity = {
  role: SenderRole
  fullName: string | null
  /** Set only when the role is 'parent'. The key to every fact below. */
  parentId?: string
  optedOut?: boolean
}

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
      .select('id, phone, full_name, opted_out_at')
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
  for (const row of (parents.data ?? []) as {
    id: string
    phone: string
    full_name: string | null
    opted_out_at: string | null
  }[]) {
    found.set(row.phone, {
      role: 'parent',
      fullName: row.full_name,
      parentId: row.id,
      optedOut: row.opted_out_at !== null,
    })
  }

  return found
}

/**
 * Which of `phones` may still be sent a free-text message.
 *
 * `isInSessionWindow` answers this for one phone; the inbox needs it for every
 * row, and forty round trips to render a list is not a list. Same table, same
 * 24h rule, one query.
 */
async function phonesInSessionWindow(orgId: string, phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set()

  const db = createServiceRoleClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('whatsapp_processed_messages')
    .select('phone')
    .eq('organization_id', orgId)
    .in('phone', phones)
    .gte('created_at', since)

  if (error) {
    // Fail closed, exactly as isInSessionWindow does: claiming a window is open
    // when it is not produces a send that Meta rejects with 131047.
    console.warn('[whatsapp/conversations] window lookup failed', { orgId, error: error.message })
    return new Set()
  }

  return new Set(((data ?? []) as { phone: string }[]).map((r) => r.phone))
}

type ParentFacts = {
  parentId: string
  optedOut: boolean
  studentNames: string[]
  teacherNames: string[]
  groupNames: string[]
  hasOpenDebt: boolean
}

/**
 * The context the inbox turns into tags: whose parent this is, which teacher
 * and group that student belongs to, and whether they owe money.
 *
 * Five `in (…)` queries for the whole list, walking the same graph
 * phonesReachableByTeacher walks. Only parents have facts — a student, a
 * teacher or a stranger writing to the business number is nobody's parent, and
 * the map simply has no entry for them.
 */
async function resolveParentFacts(
  orgId: string,
  phones: string[],
  identities: Map<string, Identity>
): Promise<Map<string, ParentFacts>> {
  const byParentId = new Map<string, string>()
  for (const phone of phones) {
    const id = identities.get(phone)?.parentId
    if (id) byParentId.set(id, phone)
  }
  if (byParentId.size === 0) return new Map()

  const db = createServiceRoleClient()
  const parentIds = [...byParentId.keys()]

  const { data: rels } = await db
    .from('relationships')
    .select('parent_id, student_id')
    .eq('organization_id', orgId)
    .in('parent_id', parentIds)

  const relations = (rels ?? []) as { parent_id: string; student_id: string }[]
  const studentIds = [...new Set(relations.map((r) => r.student_id))]

  if (studentIds.length === 0) {
    return new Map(
      [...byParentId].map(([parentId, phone]) => [
        phone,
        {
          parentId,
          optedOut: identities.get(phone)?.optedOut ?? false,
          studentNames: [],
          teacherNames: [],
          groupNames: [],
          hasOpenDebt: false,
        },
      ])
    )
  }

  const [studentsRes, groupsRes, debtRes] = await Promise.all([
    db
      .from('students')
      .select('id, full_name, teacher_id')
      .eq('organization_id', orgId)
      .in('id', studentIds),
    db
      .from('student_group_members')
      .select('student_id, student_groups!inner(name)')
      .in('student_id', studentIds),
    // The same predicate the open_debt audience uses — a charge that is neither
    // paid nor cancelled is money outstanding.
    db
      .from('charges')
      .select('student_id')
      .eq('organization_id', orgId)
      .in('student_id', studentIds)
      .neq('status', 'paid')
      .neq('status', 'cancelled'),
  ])

  const students = (studentsRes.data ?? []) as {
    id: string
    full_name: string | null
    teacher_id: string | null
  }[]

  const teacherIds = [...new Set(students.map((s) => s.teacher_id).filter(Boolean))] as string[]
  const teacherNames = await resolveTeacherNames(orgId, teacherIds)

  const studentById = new Map(students.map((s) => [s.id, s]))

  const groupsByStudent = new Map<string, string[]>()
  for (const row of (groupsRes.data ?? []) as unknown as {
    student_id: string
    student_groups: { name: string } | null
  }[]) {
    if (!row.student_groups?.name) continue
    const list = groupsByStudent.get(row.student_id) ?? []
    list.push(row.student_groups.name)
    groupsByStudent.set(row.student_id, list)
  }

  const indebted = new Set(
    ((debtRes.data ?? []) as { student_id: string | null }[])
      .map((r) => r.student_id)
      .filter((id): id is string => Boolean(id))
  )

  const studentsByParent = new Map<string, string[]>()
  for (const rel of relations) {
    const list = studentsByParent.get(rel.parent_id) ?? []
    list.push(rel.student_id)
    studentsByParent.set(rel.parent_id, list)
  }

  const facts = new Map<string, ParentFacts>()
  for (const [parentId, phone] of byParentId) {
    const ids = studentsByParent.get(parentId) ?? []
    const names: string[] = []
    const teachers = new Set<string>()
    const groups = new Set<string>()
    let hasOpenDebt = false

    for (const id of ids) {
      const student = studentById.get(id)
      if (student?.full_name) names.push(student.full_name)
      if (student?.teacher_id) {
        const name = teacherNames.get(student.teacher_id)
        if (name) teachers.add(name)
      }
      for (const group of groupsByStudent.get(id) ?? []) groups.add(group)
      if (indebted.has(id)) hasOpenDebt = true
    }

    facts.set(phone, {
      parentId,
      optedOut: identities.get(phone)?.optedOut ?? false,
      studentNames: names,
      teacherNames: [...teachers],
      groupNames: [...groups],
      hasOpenDebt,
    })
  }

  return facts
}

/** teachers.id → the person's name, which lives on the linked profile. */
async function resolveTeacherNames(
  orgId: string,
  teacherIds: string[]
): Promise<Map<string, string>> {
  if (teacherIds.length === 0) return new Map()

  const db = createServiceRoleClient()
  const { data } = await db
    .from('teachers')
    .select('id, profiles!inner(full_name)')
    .eq('organization_id', orgId)
    .in('id', teacherIds)

  const names = new Map<string, string>()
  for (const row of (data ?? []) as unknown as {
    id: string
    profiles: { full_name: string | null } | null
  }[]) {
    if (row.profiles?.full_name) names.set(row.id, row.profiles.full_name)
  }
  return names
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
