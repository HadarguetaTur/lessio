'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { requireQuotaCapacity } from '@/lib/saas/quota'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getStudentLessons, getStudentFinancial, getStudentPrimaryParent, type StudentLesson, type StudentFinancial, type StudentPrimaryParent } from '@/lib/students'
import { getAssignments, type HomeworkAssignment } from '@/lib/homework'
import { getSubscriptions, type Subscription } from '@/lib/subscriptions'
import { getGoalsForStudent, type StudentGoal } from '@/lib/goals'

type ActionState = { error: string } | null

const studentSchema = z.object({
  full_name: z.string().min(1, 'שם מלא הוא שדה חובה'),
  phone: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  focused_subject: z.string().optional().nullable(),
  weekly_quota: z.coerce.number().int().min(1).max(10).optional().nullable(),
  status: z.enum(['active', 'on_hold', 'inactive']).default('active'),
  notes: z.string().optional().nullable(),
  teacher_id: z.string().uuid().optional().nullable(),
})

const PARENT_RELATIONS = new Set(['mother', 'father', 'guardian', 'other'])

export async function createStudent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = {
    full_name: (formData.get('full_name') as string ?? '').trim(),
    phone: (formData.get('phone') as string ?? '').trim() || null,
    grade: (formData.get('grade') as string ?? '').trim() || null,
    level: (formData.get('level') as string ?? '').trim() || null,
    focused_subject: (formData.get('focused_subject') as string ?? '').trim() || null,
    weekly_quota: formData.get('weekly_quota') ? formData.get('weekly_quota') : null,
    status: (formData.get('status') as string) || 'active',
    notes: (formData.get('notes') as string ?? '').trim() || null,
    teacher_id: (formData.get('teacher_id') as string ?? '').trim() || null,
  }

  const parsed = studentSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  let phoneNorm: string | null = null
  if (parsed.data.phone) {
    try {
      phoneNorm = normalizePhone(parsed.data.phone)
    } catch (e) {
      if (e instanceof PhoneNormalizationError) {
        return { error: 'טלפון התלמיד לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
      }
      return { error: 'שגיאה בעיבוד מספר הטלפון של התלמיד' }
    }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }
  requireMutation(session)
  await requireQuotaCapacity(session.orgId, 'students')
  const orgId = session.orgId

  const addParentOn = formData.get('add_parent') === 'on'
  let parentPlan:
    | { mode: 'existing'; parentId: string }
    | { mode: 'new'; full_name: string; phone: string; email: string | null; relation_type: string | null }
    | null = null

  if (addParentOn) {
    const modeRaw = (formData.get('parent_mode') as string ?? '').trim()
    const modeNew = modeRaw === 'new'
    if (!modeNew) {
      const parentId = (formData.get('parent_id') as string ?? '').trim()
      if (!parentId) {
        return { error: 'בחרו הורה קיים מהרשימה או הפעילו יצירת הורה חדש עם שם וטלפון' }
      }
      parentPlan = { mode: 'existing', parentId }
    } else {
      const pfn = (formData.get('new_parent_full_name') as string ?? '').trim()
      const pphoneRaw = (formData.get('new_parent_phone') as string ?? '').trim()
      const pem = (formData.get('new_parent_email') as string ?? '').trim()
      const relRaw = (formData.get('new_parent_relation_type') as string ?? '').trim()

      if (!pfn || !pphoneRaw) {
        return { error: 'בהוספת הורה חדש נדרשים שם והטלפון הראשי' }
      }

      let pPhone: string
      try {
        pPhone = normalizePhone(pphoneRaw)
      } catch (e) {
        if (e instanceof PhoneNormalizationError) {
          return { error: 'מספר הטלפון של ההורה לא תקין' }
        }
        return { error: 'שגיאה בעיבוד מספר הטלפון של ההורה' }
      }

      let parentEmail: string | null = null
      if (pem) {
        const em = z.string().email().safeParse(pem)
        if (!em.success) return { error: 'אימייל ההורה לא תקין' }
        parentEmail = em.data
      }

      const relation_type = relRaw && PARENT_RELATIONS.has(relRaw) ? relRaw : null
      parentPlan = { mode: 'new', full_name: pfn, phone: pPhone, email: parentEmail, relation_type }
    }
  }

  const supabase = await createClient()

  let teacher_id = parsed.data.teacher_id ?? null
  if (!teacher_id) {
    const { data: teacherRows } = await supabase
      .from('teachers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
    if (teacherRows && teacherRows.length === 1) {
      teacher_id = teacherRows[0].id as string
    }
  }

  const insertBody = {
    organization_id: orgId,
    full_name: parsed.data.full_name,
    grade: parsed.data.grade,
    phone: phoneNorm,
    level: parsed.data.level,
    focused_subject: parsed.data.focused_subject,
    weekly_quota: parsed.data.weekly_quota,
    notes: parsed.data.notes,
    status: parsed.data.status,
    teacher_id,
  }

  const { data: insertedStudent, error: insErr } = await supabase
    .from('students')
    .insert(insertBody)
    .select('id')
    .single()

  if (insErr || !insertedStudent) return { error: 'שגיאה ביצירת התלמיד' }

  const newStudentId = insertedStudent.id

  async function rollbackStudent() {
    await supabase.from('students').delete().eq('id', newStudentId).eq('organization_id', orgId)
  }

  if (parentPlan) {
    let parentUuid: string
    if (parentPlan.mode === 'existing') {
      const { data: prow, error: pchkErr } = await supabase
        .from('parents')
        .select('id')
        .eq('id', parentPlan.parentId)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (pchkErr || !prow) {
        await rollbackStudent()
        return { error: 'הורה שנבחר לא נמצא בארגון' }
      }
      parentUuid = prow.id as string

      await supabase
        .from('relationships')
        .update({ is_primary: false })
        .eq('student_id', newStudentId)
        .eq('organization_id', orgId)

      const { error: relErr } = await supabase
        .from('relationships')
        .upsert(
          {
            organization_id: orgId,
            parent_id: parentUuid,
            student_id: newStudentId,
            is_primary: true,
          },
          { onConflict: 'parent_id,student_id' }
        )

      if (relErr) {
        await rollbackStudent()
        return { error: 'התלמיד נוצר אך קישור ההורה נכשל' }
      }
    } else {
      const { data: np, error: pInsErr } = await supabase
        .from('parents')
        .insert({
          organization_id: orgId,
          full_name: parentPlan.full_name,
          phone: parentPlan.phone,
          email: parentPlan.email,
          relation_type: parentPlan.relation_type,
          notes: null,
        })
        .select('id')
        .single()

      if (pInsErr || !np) {
        await rollbackStudent()
        if (pInsErr?.code === '23505') {
          return {
            error: 'מספר הטלפון של ההורה כבר קיים — בחרו הורה קיים מהרשימה',
          }
        }
        return { error: 'שגיאה ביצירת רשומת ההורה' }
      }

      parentUuid = np.id as string

      await supabase
        .from('relationships')
        .update({ is_primary: false })
        .eq('student_id', newStudentId)
        .eq('organization_id', orgId)

      const { error: relErr } = await supabase.from('relationships').insert({
        organization_id: orgId,
        parent_id: parentUuid,
        student_id: newStudentId,
        is_primary: true,
      })

      if (relErr) {
        await rollbackStudent()
        await supabase.from('parents').delete().eq('id', parentUuid).eq('organization_id', orgId)
        return { error: 'יצירת התלמיד וההורה בוטלה בשל שגיאה בקישור' }
      }
    }
  }

  redirect('/students')
}

export async function updateStudent(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = {
    full_name: (formData.get('full_name') as string ?? '').trim(),
    phone: (formData.get('phone') as string ?? '').trim() || null,
    grade: (formData.get('grade') as string ?? '').trim() || null,
    level: (formData.get('level') as string ?? '').trim() || null,
    focused_subject: (formData.get('focused_subject') as string ?? '').trim() || null,
    weekly_quota: formData.get('weekly_quota') ? formData.get('weekly_quota') : null,
    status: (formData.get('status') as string) || 'active',
    notes: (formData.get('notes') as string ?? '').trim() || null,
    teacher_id: (formData.get('teacher_id') as string ?? '').trim() || null,
  }

  const parsed = studentSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const session = await getSession()
  requireMutation(session)
  const { orgId, role, profileId } = session
  const supabase = await createClient()

  if (role === 'teacher') {
    const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
    if (!teacher) return { error: 'לא נמצא פרופיל מורה פעיל' }

    const { data: existing, error: fetchErr } = await supabase
      .from('students')
      .select('id, teacher_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()
    if (fetchErr || !existing) return { error: 'תלמיד לא נמצא' }
    if (existing.teacher_id !== teacher.id) {
      return { error: 'ניתן לעדכן רק תלמידים המשויכים אליך' }
    }

    const { error } = await supabase
      .from('students')
      .update({
        grade: parsed.data.grade,
        level: parsed.data.level,
        focused_subject: parsed.data.focused_subject,
        weekly_quota: parsed.data.weekly_quota,
        notes: parsed.data.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) return { error: 'שגיאה בעדכון התלמיד' }
    revalidatePath('/students')
    return null
  }

  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה לביצוע פעולה זו' }

  let phoneForDb: string | null = parsed.data.phone ?? null
  if (parsed.data.phone) {
    try {
      phoneForDb = normalizePhone(parsed.data.phone)
    } catch (e) {
      if (e instanceof PhoneNormalizationError) {
        return { error: 'טלפון התלמיד לא תקין. יש להזין מספר ישראלי (לדוגמה: 0501234567)' }
      }
      return { error: 'שגיאה בעיבוד מספר הטלפון של התלמיד' }
    }
  }

  const { error } = await supabase
    .from('students')
    .update({
      full_name: parsed.data.full_name,
      phone: phoneForDb,
      grade: parsed.data.grade,
      level: parsed.data.level,
      focused_subject: parsed.data.focused_subject,
      weekly_quota: parsed.data.weekly_quota,
      status: parsed.data.status,
      notes: parsed.data.notes,
      teacher_id: parsed.data.teacher_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: 'שגיאה בעדכון התלמיד' }

  // Handle primary parent linking
  const parentId = (formData.get('parent_id') as string ?? '').trim() || null
  if (parentId) {
    // Clear existing primary for this student, then upsert the chosen parent
    await supabase
      .from('relationships')
      .update({ is_primary: false })
      .eq('student_id', id)
      .eq('organization_id', orgId)

    const { error: relError } = await supabase
      .from('relationships')
      .upsert(
        { organization_id: orgId, parent_id: parentId, student_id: id, is_primary: true },
        { onConflict: 'parent_id,student_id' }
      )

    if (relError) return { error: 'התלמיד עודכן, אך שיוך ההורה נכשל' }
  }

  revalidatePath('/students')
  return null
}

export async function archiveStudent(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('students')
    .update({ status: 'inactive', is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/students')
}

export async function restoreStudent(id: string): Promise<void> {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') return

  const supabase = await createClient()

  await supabase
    .from('students')
    .update({ status: 'active', is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)

  revalidatePath('/students')
}

export async function fetchOrgParents(): Promise<
  { data: { id: string; full_name: string; phone: string }[] } | { error: string }
> {
  try {
    const { orgId } = await getSession()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('parents')
      .select('id, full_name, phone')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    if (error) throw new Error(error.message)
    return { data: data ?? [] }
  } catch {
    return { error: 'שגיאה בטעינת רשימת ההורים' }
  }
}

// ── Lazy-tab server actions ───────────────────────────────────────────────────

export async function fetchStudentParent(
  studentId: string
): Promise<{ data: StudentPrimaryParent | null } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getStudentPrimaryParent(studentId, orgId)
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת פרטי ההורה' }
  }
}

export async function fetchStudentLessons(
  studentId: string
): Promise<{ data: StudentLesson[] } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getStudentLessons(studentId, orgId)
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת השיעורים' }
  }
}

export async function fetchStudentFinancial(
  studentId: string
): Promise<{ data: StudentFinancial } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getStudentFinancial(studentId, orgId)
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת הנתונים הפיננסיים' }
  }
}

export async function fetchStudentHomework(
  studentId: string
): Promise<{ data: HomeworkAssignment[] } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getAssignments(orgId, { studentId })
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת שיעורי הבית' }
  }
}

export async function fetchStudentSubscriptions(
  studentId: string
): Promise<{ data: Subscription[] } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getSubscriptions(orgId, studentId)
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת המנויים' }
  }
}

export async function fetchStudentGoals(
  studentId: string
): Promise<{ data: StudentGoal[] } | { error: string }> {
  try {
    const { orgId } = await getSession()
    const data = await getGoalsForStudent(orgId, studentId)
    return { data }
  } catch {
    return { error: 'שגיאה בטעינת היעדים' }
  }
}
