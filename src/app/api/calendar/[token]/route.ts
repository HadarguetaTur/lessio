/**
 * GET /api/calendar/[token]
 * Per /docs/sprint-16-scope.md § Story 4.
 *
 * Public, unauthenticated route — the UUID token is the auth mechanism.
 * UUID v4 = 122 bits of entropy; treated as an opaque secret (same model as
 * Google Calendar's "private share link").
 *
 * Returns a .ics subscription file for all 'scheduled' lessons:
 *   - Past 4 weeks (calendar history)
 *   - Next 6 months (standard subscription window)
 *
 * Response headers:
 *   Content-Type: text/calendar; charset=utf-8
 *   Content-Disposition: attachment; filename="lessio-calendar.ics"
 *   Cache-Control: no-cache, no-store (always fresh — no stale slots)
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateICalString } from '@/lib/ical'
import { botString } from '@/lib/whatsapp/strings'
import { resolveRecipientLocale } from '@/lib/i18n/locale'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params

  // Validate token format (must be UUID-like to avoid obvious injection)
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Not Found', { status: 404 })
  }

  const db = createServiceRoleClient()

  // Look up teacher by ical_token
  const { data: teacher, error: teacherError } = await db
    .from('teachers')
    .select('id, organization_id, profiles(full_name, preferred_locale)')
    .eq('ical_token', token)
    .maybeSingle()

  if (teacherError || !teacher) {
    return new Response('Not Found', { status: 404 })
  }

  const teacherProfile = teacher.profiles as unknown as {
    full_name: string
    preferred_locale: string | null
  } | null

  // Load org name
  const { data: org } = await db
    .from('organizations')
    .select('name, default_locale')
    .eq('id', teacher.organization_id)
    .single()

  const orgName = org?.name ?? 'LESSIO'

  // The feed is read in the teacher's own calendar app, so its event text
  // follows the teacher's language, falling back to the org default.
  const locale = resolveRecipientLocale({
    stored: teacherProfile?.preferred_locale ?? null,
    orgDefault: (org?.default_locale as string | null) ?? null,
  })

  const teacherName = teacherProfile?.full_name ?? botString('the_teacher', locale)

  // Fetch lessons: past 4 weeks + next 6 months
  const now = new Date()
  const pastWindow = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000)
  const futureWindow = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000)

  const { data: lessons, error: lessonsError } = await db
    .from('lessons')
    .select(`
      id,
      start_at,
      end_at,
      lesson_students (
        students ( full_name )
      )
    `)
    .eq('teacher_id', teacher.id)
    .eq('organization_id', teacher.organization_id)
    .eq('status', 'scheduled')
    .gte('start_at', pastWindow.toISOString())
    .lte('start_at', futureWindow.toISOString())
    .order('start_at', { ascending: true })

  if (lessonsError) {
    console.error('[ical] Failed to fetch lessons', { teacherId: teacher.id, error: lessonsError.message })
    return new Response('Internal Server Error', { status: 500 })
  }

  type LessonRow = {
    id: string
    start_at: string
    end_at: string
    lesson_students: Array<{ students: { full_name: string } | null }>
  }

  const icalLessons = (lessons ?? []).map((l) => {
    const row = l as unknown as LessonRow
    const studentNames = row.lesson_students
      .map(ls => (ls.students as { full_name: string } | null)?.full_name ?? '')
      .filter(Boolean)

    return {
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      teacherName,
      studentNames,
      orgName,
      timezone: 'UTC',
    }
  })

  const icsContent = generateICalString(teacherName, orgName, icalLessons, locale)

  return new Response(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lessio-calendar.ics"',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
