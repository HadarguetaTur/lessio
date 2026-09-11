/**
 * One list for every conversation with a family, whichever door they came in.
 *
 * A parent who writes on WhatsApp and a parent who writes from the portal were
 * two separate pages in two separate shapes — WhatsApp keyed by phone, portal
 * keyed by student, one with delivery receipts and a 24h window, the other with
 * unread counts. Nobody running a studio thinks of those as different inboxes;
 * they think "who is waiting for me".
 *
 * So the two are merged here into one row type, sorted by recency, and the
 * channel becomes a tag rather than a destination. The thread URLs are
 * untouched — `/messages/whatsapp/<phone>` and `/messages/<studentId>` still
 * open the right conversation, and existing links keep working.
 */

import { getConversationSummaries, type ConversationSummary } from '@/lib/whatsapp/conversations'
import { getDashboardConversationSummaries } from '@/lib/portal/messages'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SenderRole } from '@/lib/whatsapp/messageLog'
import type { WaLogOrigin } from '@/lib/whatsapp/logContext'

/** Fields every row has, whatever channel it arrived on. */
type RowBase = {
  /** Stable key for React and for the active-row check. */
  key: string
  href: string
  displayName: string | null
  /** What the list shows when there is no registered name. */
  fallbackLabel: string
  lastMessage: string
  lastMessageAt: string
  awaitingReply: boolean
}

export type WhatsAppRow = RowBase &
  Omit<ConversationSummary, 'displayName' | 'lastMessage' | 'lastMessageAt' | 'awaitingReply'> & {
    channel: 'whatsapp'
  }

export type PortalRow = RowBase & {
  channel: 'portal'
  studentId: string
  studentName: string
  parentName: string
  unreadCount: number
  senderRole: SenderRole
  /** Portal threads have no bot, no window and no delivery receipts. */
  lastOrigin: WaLogOrigin | null
  takenOver: false
  windowOpen: true
}

export type InboxRow = WhatsAppRow | PortalRow

export function isWhatsAppRow(row: InboxRow): row is WhatsAppRow {
  return row.channel === 'whatsapp'
}

/**
 * Every conversation the viewer may see, newest first.
 *
 * A teacher sees only the families of their own students. WhatsApp scoping is
 * already handled inside `getConversationSummaries`; the portal side has no
 * such option, so it is filtered here against the same student set.
 */
export async function getInboxRows(
  orgId: string,
  options: { teacherId?: string } = {}
): Promise<InboxRow[]> {
  const [waSummaries, portalSummaries] = await Promise.all([
    getConversationSummaries(orgId, options),
    getDashboardConversationSummaries(orgId),
  ])

  const visibleStudents = options.teacherId
    ? await studentIdsForTeacher(orgId, options.teacherId)
    : null

  const rows: InboxRow[] = waSummaries.map((summary) => {
    const { displayName, lastMessage, lastMessageAt, awaitingReply, ...rest } = summary
    return {
      ...rest,
      channel: 'whatsapp',
      key: `wa:${summary.phone}`,
      href: `/messages/whatsapp/${encodeURIComponent(summary.phone)}`,
      displayName,
      fallbackLabel: summary.phone,
      lastMessage,
      lastMessageAt,
      awaitingReply,
    }
  })

  for (const summary of portalSummaries) {
    if (visibleStudents && !visibleStudents.has(summary.studentId)) continue

    rows.push({
      channel: 'portal',
      key: `portal:${summary.studentId}`,
      href: `/messages/${summary.studentId}`,
      studentId: summary.studentId,
      studentName: summary.studentName,
      parentName: summary.parentName,
      displayName: summary.parentName || summary.studentName,
      fallbackLabel: summary.studentName,
      lastMessage: summary.lastMessage,
      lastMessageAt: summary.lastMessageAt,
      // An unread parent message is the portal's version of "nobody has
      // answered this yet", which is what the inbox filter means by it.
      awaitingReply: summary.unreadCount > 0,
      unreadCount: summary.unreadCount,
      senderRole: 'parent',
      lastOrigin: null,
      takenOver: false,
      windowOpen: true,
    })
  }

  return rows.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

/**
 * The students a teacher may see — assigned to them, or sharing one of their
 * lessons. The same two meanings `phonesReachableByTeacher` uses on the
 * WhatsApp side, applied to the portal list.
 */
async function studentIdsForTeacher(orgId: string, teacherId: string): Promise<Set<string>> {
  const db = createServiceRoleClient()

  const [assigned, viaLessons] = await Promise.all([
    db.from('students').select('id').eq('organization_id', orgId).eq('teacher_id', teacherId),
    db
      .from('lesson_students')
      .select('student_id, lessons!inner(teacher_id, organization_id)')
      .eq('lessons.teacher_id', teacherId)
      .eq('lessons.organization_id', orgId),
  ])

  return new Set<string>([
    ...((assigned.data ?? []) as { id: string }[]).map((r) => r.id),
    ...((viaLessons.data ?? []) as { student_id: string }[]).map((r) => r.student_id),
  ])
}
