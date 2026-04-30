/**
 * Builds the Hebrew system prompt for the AI assistant.
 * Fetches org info, parent context, upcoming lessons, outstanding balance, and holidays.
 * Per /docs/sprint-19-scope.md § Story 1 — Steps inside aiAssistant().
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function buildSystemPrompt(
  orgId: string,
  phone: string,
  parentIdOverride: string | null = null
): Promise<string> {
  const db = createServiceRoleClient()

  // Fetch org
  const { data: org } = await db
    .from('organizations')
    .select('name, timezone')
    .eq('id', orgId)
    .single()

  const orgName = (org?.name as string | null) ?? 'בית הספר'
  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'

  // Fetch parent
  const parentQuery = db
    .from('parents')
    .select('id, full_name')
    .eq('organization_id', orgId)

  const { data: parent } = parentIdOverride
    ? await parentQuery.eq('id', parentIdOverride).maybeSingle()
    : await parentQuery.eq('phone', phone).maybeSingle()

  const parentName = (parent as { id: string; full_name: string } | null)?.full_name ?? 'הלקוח'
  const parentId = (parent as { id: string; full_name: string } | null)?.id ?? null

  // Fetch student names + IDs for this parent
  let studentNames = ''
  let studentIds: string[] = []

  if (parentId) {
    const { data: rels } = await db
      .from('relationships')
      .select('student_id, students ( full_name )')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)

    type RelRow = { student_id: string; students: { full_name: string } | null }
    const relRows = (rels ?? []) as unknown as RelRow[]
    studentIds = relRows.map((r) => r.student_id)
    studentNames = relRows
      .map((r) => r.students?.full_name)
      .filter(Boolean)
      .join(', ')
  }

  // Fetch upcoming lessons (next 3)
  let upcomingLessonsText = 'אין שיעורים מתוכננים'
  if (studentIds.length > 0) {
    const { data: lsRows } = await db
      .from('lesson_students')
      .select('lesson_id')
      .eq('organization_id', orgId)
      .in('student_id', studentIds)

    const lessonIds = ((lsRows ?? []) as Array<{ lesson_id: string }>).map((r) => r.lesson_id)

    if (lessonIds.length > 0) {
      const { data: lessons } = await db
        .from('lessons')
        .select('start_at, teachers ( profiles ( full_name ) ), lesson_students ( students ( full_name ) )')
        .in('id', lessonIds)
        .eq('organization_id', orgId)
        .eq('status', 'scheduled')
        .gt('start_at', new Date().toISOString())
        .order('start_at', { ascending: true })
        .limit(3)

      type LessonRow = {
        start_at: string
        teachers: { profiles: { full_name: string } | null } | null
        lesson_students: Array<{ students: { full_name: string } | null }>
      }

      if (lessons && lessons.length > 0) {
        upcomingLessonsText = (lessons as unknown as LessonRow[])
          .map((l) => {
            const dt = DateTime.fromISO(l.start_at, { zone: 'utc' }).setZone(timezone)
            const dateStr = dt.toFormat("EEEE d/M 'בשעה' HH:mm", { locale: 'he' })
            const teacherName =
              (l.teachers?.profiles as { full_name: string } | null)?.full_name ?? 'המורה'
            const studentName = l.lesson_students?.[0]?.students?.full_name ?? ''
            return `${dateStr} עם ${teacherName}${studentName ? ` (${studentName})` : ''}`
          })
          .join('\n')
      }
    }
  }

  // Fetch outstanding balance
  let balanceText = '₪0.00'
  if (parentId) {
    const { data: charges } = await db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('parent_id', parentId)
      .in('status', ['pending', 'invoiced'])

    const total = ((charges ?? []) as Array<{ amount: number }>).reduce(
      (sum, c) => sum + c.amount,
      0
    )
    balanceText = `₪${total.toFixed(2)}`
  }

  // Fetch holidays in next 30 days
  const now = DateTime.now().setZone(timezone)
  const in30Days = now.plus({ days: 30 })
  let holidaysText = ''

  const { data: holidays } = await db
    .from('organization_holidays')
    .select('date, name')
    .eq('organization_id', orgId)
    .gte('date', now.toISODate()!)
    .lte('date', in30Days.toISODate()!)
    .order('date', { ascending: true })

  if (holidays && holidays.length > 0) {
    holidaysText =
      '\nחגים וחופשות בחודש הקרוב:\n' +
      (holidays as Array<{ date: string; name: string }>)
        .map((h) => `${h.date}: ${h.name}`)
        .join('\n')
  }

  return `אתה עוזר AI של ${orgName}. ענה תמיד בעברית בגובה העיניים.

מידע על הלקוח:
- שם: ${parentName}${studentNames ? `\n- תלמידים: ${studentNames}` : ''}
- שיעורים קרובים: ${upcomingLessonsText}
- יתרה לתשלום: ${balanceText}${holidaysText}

כללים:
- ענה רק על שאלות הקשורות ל${orgName}
- אל תיצור, תבטל, או תשנה שיעורים
- אל תבטיח הנחות או שינויי מדיניות
- אם השאלה מחוץ לתחום שלך, הפנה לצוות`
}
