import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import type { EntityType, ValidatedRow } from './validators'
import { normalizeStatus, normalizeLessonType, normalizeDayOfWeek } from './validators'

export interface ImportResult {
  inserted: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

type NameIdMap = Map<string, string>

function buildNameLookup(
  records: { id: string; name: string }[]
): NameIdMap {
  const map = new Map<string, string>()
  for (const r of records) {
    map.set(r.name, r.id)
    map.set(r.name.toLowerCase(), r.id)
    map.set(r.name.trim(), r.id)
    map.set(r.name.trim().toLowerCase(), r.id)
  }
  return map
}

function findInMap(map: NameIdMap, name: string | null | undefined): string | null {
  if (!name) return null
  return map.get(name) ?? map.get(name.toLowerCase()) ?? map.get(name.trim()) ?? map.get(name.trim().toLowerCase()) ?? null
}

const BATCH_SIZE = 50

export async function executeImport(
  orgId: string,
  entityType: EntityType,
  validRows: ValidatedRow[],
  timezone: string
): Promise<ImportResult> {
  const db = createServiceRoleClient()
  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  const rows = validRows.filter((r) => r.status !== 'error')

  if (rows.length === 0) return result

  switch (entityType) {
    case 'students':
      return importStudents(db, orgId, rows, result)
    case 'parents':
      return importParents(db, orgId, rows, result)
    case 'teachers':
      return importTeachers(db, orgId, rows, result)
    case 'lessons-schedule':
      return importLessonSchedule(db, orgId, rows, result, timezone)
    case 'lessons-history':
      return importLessonHistory(db, orgId, rows, result, timezone)
  }
}

async function importStudents(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rows: ValidatedRow[],
  result: ImportResult
): Promise<ImportResult> {
  // Pre-fetch teachers for name matching
  const { data: teachers } = await db
    .from('teachers')
    .select('id, profile:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  const teacherMap = buildNameLookup(
    (teachers ?? []).map((t) => ({
      id: t.id,
      name: (t.profile as unknown as { full_name: string } | null)?.full_name ?? '',
    }))
  )

  const newRows = rows.filter((r) => !r.existingId)
  const updateRows = rows.filter((r) => !!r.existingId)

  // Batch insert new rows
  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE)
    const inserts = batch.map((row) => ({
      organization_id: orgId,
      full_name: row.data.full_name!,
      grade: row.data.grade || null,
      phone: row.data.phone || null,
      level: row.data.level || null,
      focused_subject: row.data.focused_subject || null,
      weekly_quota: row.data.weekly_quota ? parseInt(row.data.weekly_quota) : null,
      notes: row.data.notes || null,
      status: normalizeStatus(row.data.status) || 'active',
      teacher_id: findInMap(teacherMap, row.data.teacher_name),
    }))

    const { data, error } = await db
      .from('students')
      .insert(inserts)
      .select('id')

    if (error) {
      for (const row of batch) {
        result.errors.push({ row: row.rowIndex + 2, message: error.message })
      }
      result.skipped += batch.length
    } else {
      result.inserted += data?.length ?? 0
    }
  }

  // Update existing rows one by one
  for (const row of updateRows) {
    const { error } = await db
      .from('students')
      .update({
        full_name: row.data.full_name!,
        grade: row.data.grade || null,
        phone: row.data.phone || null,
        level: row.data.level || null,
        focused_subject: row.data.focused_subject || null,
        weekly_quota: row.data.weekly_quota ? parseInt(row.data.weekly_quota) : null,
        notes: row.data.notes || null,
        status: normalizeStatus(row.data.status) || 'active',
        teacher_id: findInMap(teacherMap, row.data.teacher_name),
      })
      .eq('id', row.existingId!)

    if (error) {
      result.errors.push({ row: row.rowIndex + 2, message: error.message })
      result.skipped++
    } else {
      result.updated++
    }
  }

  return result
}

async function importParents(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rows: ValidatedRow[],
  result: ImportResult
): Promise<ImportResult> {
  // Pre-fetch students for student_names linking
  const { data: students } = await db
    .from('students')
    .select('id, full_name')
    .eq('organization_id', orgId)

  const studentMap = buildNameLookup(
    (students ?? []).map((s) => ({ id: s.id, name: s.full_name }))
  )

  for (const row of rows) {
    let phone: string
    try {
      phone = normalizePhone(row.data.phone ?? '')
    } catch (e) {
      if (e instanceof PhoneNormalizationError) {
        result.errors.push({ row: row.rowIndex + 2, message: 'מספר טלפון לא תקין' })
        result.skipped++
        continue
      }
      throw e
    }

    let parentId: string

    if (row.existingId) {
      const { error } = await db
        .from('parents')
        .update({
          full_name: row.data.full_name!,
          notes: row.data.notes || null,
        })
        .eq('id', row.existingId)

      if (error) {
        result.errors.push({ row: row.rowIndex + 2, message: error.message })
        result.skipped++
        continue
      }

      parentId = row.existingId
      result.updated++

      // Remove old student links before re-linking
      await db
        .from('relationships')
        .delete()
        .eq('parent_id', parentId)
        .eq('organization_id', orgId)
    } else {
      const { data: parent, error } = await db
        .from('parents')
        .insert({
          organization_id: orgId,
          full_name: row.data.full_name!,
          phone,
          notes: row.data.notes || null,
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          result.errors.push({ row: row.rowIndex + 2, message: 'מספר טלפון כפול' })
        } else {
          result.errors.push({ row: row.rowIndex + 2, message: error.message })
        }
        result.skipped++
        continue
      }

      parentId = parent.id
      result.inserted++
    }

    // Link to students if student_names (or singular student_name) provided
    const studentNamesRaw = row.data.student_names || row.data.student_name
    if (studentNamesRaw) {
      const names = studentNamesRaw.split(',').map((n) => n.trim()).filter(Boolean)
      for (const name of names) {
        const studentId = findInMap(studentMap, name)
        if (studentId) {
          await db.from('relationships').insert({
            organization_id: orgId,
            parent_id: parentId,
            student_id: studentId,
            is_primary: true,
          })
        }
      }
    }
  }

  return result
}

async function importTeachers(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rows: ValidatedRow[],
  result: ImportResult
): Promise<ImportResult> {
  for (const row of rows) {
    const fullName = row.data.full_name!.trim()
    const email = row.data.email!.trim().toLowerCase()

    if (row.existingId) {
      const { error: profileError } = await db
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', row.existingId)

      if (profileError) {
        result.errors.push({ row: row.rowIndex + 2, message: 'שגיאה בעדכון פרופיל' })
        result.skipped++
        continue
      }

      const { error: teacherError } = await db
        .from('teachers')
        .update({
          bio: row.data.bio || null,
          hourly_rate: row.data.hourly_rate ? parseFloat(row.data.hourly_rate) : null,
        })
        .eq('profile_id', row.existingId)
        .eq('organization_id', orgId)

      if (teacherError) {
        result.errors.push({ row: row.rowIndex + 2, message: 'שגיאה בעדכון רשומת מורה' })
        result.skipped++
        continue
      }

      result.updated++
      continue
    }

    const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    })

    if (inviteError || !inviteData?.user) {
      const msg = inviteError?.message ?? ''
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        result.errors.push({ row: row.rowIndex + 2, message: `אימייל ${email} כבר רשום במערכת` })
      } else {
        result.errors.push({ row: row.rowIndex + 2, message: `שליחת הזמנה נכשלה: ${msg}` })
      }
      result.skipped++
      continue
    }

    const userId = inviteData.user.id

    const { error: profileError } = await db.from('profiles').insert({
      id: userId,
      organization_id: orgId,
      full_name: fullName,
      role: 'teacher',
      is_active: true,
    })

    if (profileError) {
      await db.auth.admin.deleteUser(userId)
      result.errors.push({ row: row.rowIndex + 2, message: 'שגיאה ביצירת פרופיל' })
      result.skipped++
      continue
    }

    const { error: teacherError } = await db.from('teachers').insert({
      organization_id: orgId,
      profile_id: userId,
      bio: row.data.bio || null,
      hourly_rate: row.data.hourly_rate ? parseFloat(row.data.hourly_rate) : null,
    })

    if (teacherError) {
      await db.auth.admin.deleteUser(userId)
      result.errors.push({ row: row.rowIndex + 2, message: 'שגיאה ביצירת רשומת מורה' })
      result.skipped++
      continue
    }

    result.inserted++
  }

  return result
}

async function importLessonSchedule(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rows: ValidatedRow[],
  result: ImportResult,
  timezone: string
): Promise<ImportResult> {
  // Pre-fetch teachers and students
  const { data: teachers } = await db
    .from('teachers')
    .select('id, profile:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  const teacherMap = buildNameLookup(
    (teachers ?? []).map((t) => ({
      id: t.id,
      name: (t.profile as unknown as { full_name: string } | null)?.full_name ?? '',
    }))
  )

  const { data: students } = await db
    .from('students')
    .select('id, full_name')
    .eq('organization_id', orgId)

  const studentMap = buildNameLookup(
    (students ?? []).map((s) => ({ id: s.id, name: s.full_name }))
  )

  const WEEKS_AHEAD = 4

  for (const row of rows) {
    const teacherId = findInMap(teacherMap, row.data.teacher_name)
    const studentId = findInMap(studentMap, row.data.student_name)

    if (!teacherId) {
      result.errors.push({ row: row.rowIndex + 2, message: `מורה "${row.data.teacher_name}" לא נמצא` })
      result.skipped++
      continue
    }
    if (!studentId) {
      result.errors.push({ row: row.rowIndex + 2, message: `תלמיד "${row.data.student_name}" לא נמצא` })
      result.skipped++
      continue
    }

    const dayOfWeek = normalizeDayOfWeek(row.data.day_of_week)
    if (dayOfWeek === null) {
      result.errors.push({ row: row.rowIndex + 2, message: 'יום בשבוע לא תקין' })
      result.skipped++
      continue
    }

    const startTime = row.data.start_time!
    const duration = parseInt(row.data.duration_minutes!)
    const lessonType = normalizeLessonType(row.data.lesson_type)

    // Create lesson_series
    const rule = {
      dayOfWeek,
      startTime,
      durationMinutes: duration,
    }

    const { data: series, error: seriesError } = await db
      .from('lesson_series')
      .insert({
        organization_id: orgId,
        teacher_id: teacherId,
        student_id: studentId,
        rule,
      })
      .select('id')
      .single()

    if (seriesError) {
      result.errors.push({ row: row.rowIndex + 2, message: seriesError.message })
      result.skipped++
      continue
    }

    // Generate lessons for the next N weeks
    const now = new Date()
    let lessonsCreated = 0

    for (let w = 0; w < WEEKS_AHEAD; w++) {
      const lessonDate = getNextDayOfWeek(now, dayOfWeek, w)
      const [hours, minutes] = startTime.split(':').map(Number)

      const startAt = new Date(lessonDate)
      startAt.setHours(hours, minutes, 0, 0)

      const endAt = new Date(startAt.getTime() + duration * 60 * 1000)

      const { data: lesson, error: lessonError } = await db
        .from('lessons')
        .insert({
          organization_id: orgId,
          teacher_id: teacherId,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          status: 'scheduled',
          lesson_type: lessonType,
          max_students: lessonType === 'individual' ? 1 : lessonType === 'pair' ? 2 : 10,
          series_id: series.id,
        })
        .select('id')
        .single()

      if (!lessonError && lesson) {
        await db.from('lesson_students').insert({
          lesson_id: lesson.id,
          student_id: studentId,
          organization_id: orgId,
          status: 'enrolled',
        })
        lessonsCreated++
      }
    }

    result.inserted += lessonsCreated
  }

  return result
}

async function importLessonHistory(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  rows: ValidatedRow[],
  result: ImportResult,
  timezone: string
): Promise<ImportResult> {
  const { data: teachers } = await db
    .from('teachers')
    .select('id, profile:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  const teacherMap = buildNameLookup(
    (teachers ?? []).map((t) => ({
      id: t.id,
      name: (t.profile as unknown as { full_name: string } | null)?.full_name ?? '',
    }))
  )

  const { data: students } = await db
    .from('students')
    .select('id, full_name')
    .eq('organization_id', orgId)

  const studentMap = buildNameLookup(
    (students ?? []).map((s) => ({ id: s.id, name: s.full_name }))
  )

  for (const row of rows) {
    const teacherId = findInMap(teacherMap, row.data.teacher_name)
    const studentId = findInMap(studentMap, row.data.student_name)

    if (!teacherId) {
      result.errors.push({ row: row.rowIndex + 2, message: `מורה "${row.data.teacher_name}" לא נמצא` })
      result.skipped++
      continue
    }
    if (!studentId) {
      result.errors.push({ row: row.rowIndex + 2, message: `תלמיד "${row.data.student_name}" לא נמצא` })
      result.skipped++
      continue
    }

    // Parse date (DD/MM/YYYY or YYYY-MM-DD)
    const dateStr = row.data.date!
    let dateParts: [number, number, number]
    if (dateStr.includes('/')) {
      const [d, m, y] = dateStr.split('/').map(Number)
      dateParts = [y, m - 1, d]
    } else {
      const [y, m, d] = dateStr.split('-').map(Number)
      dateParts = [y, m - 1, d]
    }

    const [startH, startM] = row.data.start_time!.split(':').map(Number)
    const [endH, endM] = row.data.end_time!.split(':').map(Number)

    const startAt = new Date(dateParts[0], dateParts[1], dateParts[2], startH, startM)
    const endAt = new Date(dateParts[0], dateParts[1], dateParts[2], endH, endM)

    const status = normalizeStatus(row.data.status) || 'completed'

    const { data: lesson, error } = await db
      .from('lessons')
      .insert({
        organization_id: orgId,
        teacher_id: teacherId,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status,
        lesson_type: 'individual',
        max_students: 1,
        cancel_reason: status === 'cancelled' ? (row.data.cancel_reason || null) : null,
      })
      .select('id')
      .single()

    if (error) {
      result.errors.push({ row: row.rowIndex + 2, message: error.message })
      result.skipped++
      continue
    }

    if (lesson) {
      await db.from('lesson_students').insert({
        lesson_id: lesson.id,
        student_id: studentId,
        organization_id: orgId,
        status: status === 'cancelled' ? 'cancelled' : 'enrolled',
      })
    }

    result.inserted++
  }

  return result
}

function getNextDayOfWeek(from: Date, dayOfWeek: number, weeksAhead: number): Date {
  const date = new Date(from)
  const currentDay = date.getDay()
  let daysUntil = dayOfWeek - currentDay
  if (daysUntil < 0) daysUntil += 7
  daysUntil += weeksAhead * 7
  date.setDate(date.getDate() + daysUntil)
  return date
}
