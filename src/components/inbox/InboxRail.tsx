import { getLocale } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getInboxRows } from '@/lib/inbox/rows'
import { deriveTags, type InboxTag } from '@/lib/inbox/tags'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { InboxList } from './InboxList'

/**
 * The left pane: every conversation the viewer may see, from both channels.
 *
 * Tags are derived here rather than in the client component so the rules —
 * which are the product decision — stay on the server and out of the bundle.
 * The client gets a plain map keyed by row.
 */
export async function InboxRail() {
  const session = await getSession()
  const isTeacher = session.role === 'teacher'

  const teacher = isTeacher
    ? await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
    : null

  const [rows, timezone, locale] = await Promise.all([
    // A teacher with no teacher record reaches nobody, which is the correct
    // answer rather than an error: the rail simply comes back empty.
    isTeacher && !teacher
      ? Promise.resolve([])
      : getInboxRows(session.orgId, teacher ? { teacherId: teacher.id } : {}),
    getOrgTimezone(session.orgId),
    getLocale(),
  ])

  const tagsByKey: Record<string, InboxTag[]> = {}
  for (const row of rows) {
    tagsByKey[row.key] = deriveTags(row, session.profileId)
  }

  return (
    <>
      <LiveRefresh tables={['whatsapp_messages', 'whatsapp_takeovers', 'portal_messages']} />
      <InboxList rows={rows} tagsByKey={tagsByKey} timezone={timezone} locale={locale} />
    </>
  )
}
