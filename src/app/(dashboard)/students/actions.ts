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
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

// Declared at module scope, where no translator exists — the message is a
// catalog key that zodError() resolves when the failure is surfaced.
const STUDENT_NAME_REQUIRED = 'students.errors.fullNameRequired'

const studentSchema = z.object({
  full_name: z.string().min(1, STUDENT_NAME_REQUIRED),
  phone: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  focused_subject: z.string().optional().nullable(),
  weekly_quota: z.coerce.number().int().min(1).max(10).optional().nullable(),
  status: z.enum(['active', 'on_hold', 'inactive']).default('active'),
  notes: z.string().optional().nullable(),
  teacher_id: z.string().uuid().optional().nullable(),
  // Per-student pricing — owner/admin only; the teacher branch never writes these.
  hourly_rate: z.coerce.number().positive().max(10000).optional().nullable(),
  discount_percent: z.coerce.number().min(0).max(100).optional().nullable(),
  discount_reason: z.string().max(200).optional().nullable(),
})

/** The pricing trio from a submitted form; blank fields become NULL (inherit / no discount). */
function readPricingFields(formData: FormData) {
  return {
    hourly_rate: formData.get('hourly_rate') ? formData.get('hourly_rate') : null,
    discount_percent: formData.get('discount_percent') ? formData.get('discount_percent') : null,
    discount_reason: (formData.get('discount_reason') as string ?? '').trim() || null,
  }
}

const PARENT_RELATIONS = new Set(['mother', 'father', 'guardian', 'other'])

export async function createStudent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
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
    ...readPricingFields(formData),
  }

  const parsed = studentSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  let phoneNorm: string | null = null
  if (parsed.data.phone) {
    try {
      phoneNorm = normalizePhone(parsed.data.phone)
    } catch (e) {
      if (e instanceof PhoneNormalizationError) {
        return { error: t('students.errors.invalidStudentPhone') }
      }
      return { error: t('students.errors.studentPhoneProcessing') }
    }
  }

  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') return { error: await commonError('noPermission') }
  requireMutation(session)
  await requireQuotaCapacity(session.orgId, 'students')
  const orgId = session.orgId

  const addParentOn = formData.get('add_parent') === 'on'
  let parentPlan:
    | { mode: 'existing'; parentId: string }
    | { mode: 'new'; full_name: string; phone: string; email: string | null; relation_type: string | null; consent_attested: boolean }
    | null = null

  if (addParentOn) {
    const modeRaw = (formData.get('parent_mode') as string ?? '').trim()
    const modeNew = modeRaw === 'new'
    if (!modeNew) {
      const parentId = (formData.get('parent_id') as string ?? '').trim()
      if (!parentId) {
        return { error: t('students.errors.pickOrCreateParent') }
      }
      parentPlan = { mode: 'existing', parentId }
    } else {
      const pfn = (formData.get('new_parent_full_name') as string ?? '').trim()
      const pphoneRaw = (formData.get('new_parent_phone') as string ?? '').trim()
      const pem = (formData.get('new_parent_email') as string ?? '').trim()
      const relRaw = (formData.get('new_parent_relation_type') as string ?? '').trim()

      if (!pfn || !pphoneRaw) {
        return { error: t('students.errors.newParentNeedsNameAndPhone') }
      }

      let pPhone: string
      try {
        pPhone = normalizePhone(pphoneRaw)
      } catch (e) {
        if (e instanceof PhoneNormalizationError) {
          return { error: t('students.errors.invalidParentPhone') }
        }
        return { error: t('students.errors.parentPhoneProcessing') }
      }

      let parentEmail: string | null = null
      if (pem) {
        const em = z.string().email().safeParse(pem)
        if (!em.success) return { error: t('students.errors.invalidParentEmail') }
        parentEmail = em.data
      }

      const relation_type = relRaw && PARENT_RELATIONS.has(relRaw) ? relRaw : null
      const consentRaw = formData.get('new_parent_whatsapp_consent')
      const consent_attested = consentRaw === 'on' || consentRaw === 'true' || consentRaw === '1'
      parentPlan = { mode: 'new', full_name: pfn, phone: pPhone, email: parentEmail, relation_type, consent_attested }
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
    hourly_rate: parsed.data.hourly_rate ?? null,
    discount_percent: parsed.data.discount_percent ?? null,
    discount_reason: parsed.data.discount_reason ?? null,
  }

  const { data: insertedStudent, error: insErr } = await supabase
    .from('students')
    .insert(insertBody)
    .select('id')
    .single()

  if (insErr || !insertedStudent) return { error: t('students.errors.createFailed') }

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
        return { error: t('students.errors.parentNotInOrg') }
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
        return { error: t('students.errors.studentCreatedLinkFailed') }
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
          ...(parentPlan.consent_attested
            ? { consent_source: 'attested', consented_at: new Date().toISOString(), consented_by: session.userId }
            : {}),
        })
        .select('id')
        .single()

      if (pInsErr || !np) {
        await rollbackStudent()
        if (pInsErr?.code === '23505') {
          return {
            error: t('students.errors.parentPhoneExistsPickExisting'),
          }
        }
        return { error: t('students.errors.createParentFailed') }
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
        return { error: t('students.errors.rolledBack') }
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
  const t = await getTranslations()
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
    ...readPricingFields(formData),
  }

  const parsed = studentSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const session = await getSession()
  requireMutation(session)
  const { orgId, role, profileId } = session
  const supabase = await createClient()

  if (role === 'teacher') {
    const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
    if (!teacher) return { error: t('students.errors.noTeacherProfile') }

    const { data: existing, error: fetchErr } = await supabase
      .from('students')
      .select('id, teacher_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()
    if (fetchErr || !existing) return { error: t('students.errors.studentNotFound') }
    if (existing.teacher_id !== teacher.id) {
      return { error: t('students.errors.onlyOwnStudents') }
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

    if (error) return { error: t('students.errors.updateFailed') }
    revalidatePath('/students')
    return null
  }

  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  let phoneForDb: string | null = parsed.data.phone ?? null
  if (parsed.data.phone) {
    try {
      phoneForDb = normalizePhone(parsed.data.phone)
    } catch (e) {
      if (e instanceof PhoneNormalizationError) {
        return { error: t('students.errors.invalidStudentPhone') }
      }
      return { error: t('students.errors.studentPhoneProcessing') }
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
      hourly_rate: parsed.data.hourly_rate ?? null,
      discount_percent: parsed.data.discount_percent ?? null,
      discount_reason: parsed.data.discount_reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) return { error: t('students.errors.updateFailed') }

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

    if (relError) return { error: t('students.errors.studentUpdatedLinkFailed') }
  }

  revalidatePath('/students')
  return null
}

export async function archiveStudent(id: string): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session
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
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session
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
  const t = await getTranslations()
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
    return { error: t('students.errors.loadParentsFailed') }
  }
}

// ── Lazy-tab server actions ───────────────────────────────────────────────────

export async function fetchStudentParent(
  studentId: string
): Promise<{ data: StudentPrimaryParent | null } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getStudentPrimaryParent(studentId, orgId)
    return { data }
  } catch {
    return { error: t('students.errors.loadParentFailed') }
  }
}

export async function fetchStudentLessons(
  studentId: string
): Promise<{ data: StudentLesson[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getStudentLessons(studentId, orgId)
    return { data }
  } catch {
    return { error: t('students.errors.loadLessonsFailed') }
  }
}

export async function fetchStudentFinancial(
  studentId: string
): Promise<{ data: StudentFinancial } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getStudentFinancial(studentId, orgId)
    return { data }
  } catch {
    return { error: t('students.errors.loadFinanceFailed') }
  }
}

export async function fetchStudentHomework(
  studentId: string
): Promise<{ data: HomeworkAssignment[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getAssignments(orgId, { studentId })
    return { data }
  } catch {
    return { error: t('students.errors.loadHomeworkFailed') }
  }
}

export async function fetchStudentSubscriptions(
  studentId: string
): Promise<{ data: Subscription[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getSubscriptions(orgId, studentId)
    return { data }
  } catch {
    return { error: t('students.errors.loadSubscriptionsFailed') }
  }
}

export async function fetchStudentGoals(
  studentId: string
): Promise<{ data: StudentGoal[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const data = await getGoalsForStudent(orgId, studentId)
    return { data }
  } catch {
    return { error: t('students.errors.loadGoalsFailed') }
  }
}

export async function fetchStudentExams(
  studentId: string
): Promise<{ data: import('@/lib/students/exams').StudentExam[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const { listExams } = await import('@/lib/students/exams')
    const data = await listExams(orgId, studentId)
    return { data }
  } catch {
    return { error: t('students.errors.loadExamsFailed') }
  }
}

export async function fetchStudentParentEmails(
  studentId: string
): Promise<{ data: { email: string; label: string }[] } | { error: string }> {
  const t = await getTranslations()
  try {
    const { orgId } = await getSession()
    const db = (await import('@/lib/supabase/service-role')).createServiceRoleClient()
    const { data } = await db
      .from('relationships')
      .select('parents ( full_name, email )')
      .eq('student_id', studentId)
      .eq('organization_id', orgId)
    type Row = { parents: { full_name: string; email: string | null } | null }
    const result = (data ?? [])
      .map((r) => {
        const row = r as unknown as Row
        const email = row.parents?.email?.trim()
        if (!email) return null
        const name = row.parents?.full_name ?? ''
        return { email, label: `${name} (${email})` }
      })
      .filter((x): x is { email: string; label: string } => x !== null)
    return { data: result }
  } catch {
    return { error: t('students.errors.loadEmailsFailed') }
  }
}
