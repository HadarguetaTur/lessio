import { createClient } from '@/lib/supabase/server'
import { OPEN_CHARGE_STATUSES, type ChargeStatus } from '@/lib/charges'

export type StudentStatus = 'active' | 'on_hold' | 'inactive'

export interface Student {
  id: string
  full_name: string
  phone: string | null
  grade: string | null
  level: string | null
  focused_subject: string | null
  weekly_quota: number | null
  notes: string | null
  status: StudentStatus
  is_active: boolean
  created_at: string
  teacher_id: string | null
  teacher_name: string | null
}

export interface StudentLesson {
  id: string
  start_at: string
  end_at: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  subject: string | null
  duration_minutes: number
  teacher_name: string
  amount: number | null
}

export interface StudentCharge {
  id: string
  created_at: string
  amount: number
  status: ChargeStatus
  charge_type: string
  notes: string | null
}

export interface StudentMonthlyBilling {
  id: string
  billing_month: string
  total_amount: number
  is_paid: boolean
  is_approved: boolean
}

export interface StudentFinancial {
  balance: number
  primary_parent_id: string | null
  primary_parent_name: string | null
  recent_charges: StudentCharge[]
  monthly_billings: StudentMonthlyBilling[]
}

export interface GetStudentsOptions {
  search?: string
  /** undefined = active only, true = active only, false = inactive only */
  isActive?: boolean
  /** Filter to only students assigned to this teacher */
  teacherId?: string
}

const STUDENT_SELECT =
  'id, full_name, phone, grade, level, focused_subject, weekly_quota, notes, status, is_active, created_at, teacher_id, teachers!teacher_id(profiles(full_name))'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStudent(row: any): Student {
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone ?? null,
    grade: row.grade ?? null,
    level: row.level ?? null,
    focused_subject: row.focused_subject ?? null,
    weekly_quota: row.weekly_quota ?? null,
    notes: row.notes ?? null,
    status: row.status,
    is_active: row.is_active,
    created_at: row.created_at,
    teacher_id: row.teacher_id ?? null,
    teacher_name: row.teachers?.profiles?.full_name ?? null,
  }
}

export async function getStudents(
  organizationId: string,
  options: GetStudentsOptions = {}
): Promise<Student[]> {
  const supabase = await createClient()

  let query = supabase
    .from('students')
    .select(STUDENT_SELECT)
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  const activeFilter = options.isActive ?? true
  query = query.eq('is_active', activeFilter)

  if (options.search) {
    query = query.ilike('full_name', `%${options.search}%`)
  }

  if (options.teacherId) {
    query = query.eq('teacher_id', options.teacherId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapStudent)
}

export async function getStudentById(
  id: string,
  organizationId: string
): Promise<Student | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('students')
    .select(STUDENT_SELECT)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  return data ? mapStudent(data) : null
}

/**
 * Returns all lessons for a specific student since they were created,
 * ordered newest first. Uses an inner join on lesson_students.
 */
export async function getStudentLessons(
  studentId: string,
  organizationId: string
): Promise<StudentLesson[]> {
  const supabase = await createClient()

  // Inner join: only lessons where this student is enrolled, no date limit
  const { data, error } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, status, teachers(profiles(full_name)), charges(amount), lesson_students!inner(student_id)'
    )
    .eq('organization_id', organizationId)
    .eq('lesson_students.student_id', studentId)
    .order('start_at', { ascending: false })

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((l: any) => {
    const teacher = l.teachers as { profiles: { full_name: string } } | null
    const startAt = new Date(l.start_at)
    const endAt = new Date(l.end_at)
    const durationMs = endAt.getTime() - startAt.getTime()
    const charge = Array.isArray(l.charges) && l.charges.length > 0 ? l.charges[0] : null

    return {
      id: l.id as string,
      start_at: l.start_at as string,
      end_at: l.end_at as string,
      status: l.status as StudentLesson['status'],
      subject: null,
      duration_minutes: Math.round(durationMs / 60000),
      teacher_name: teacher?.profiles?.full_name ?? '—',
      amount: charge ? Number(charge.amount) : null,
    }
  })
}

export interface StudentPrimaryParent {
  id: string
  full_name: string
  phone: string
}

/**
 * Returns the primary parent linked to this student, or null if none.
 */
export async function getStudentPrimaryParent(
  studentId: string,
  organizationId: string
): Promise<StudentPrimaryParent | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('relationships')
    .select('parent_id, is_primary, parents(id, full_name, phone)')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const p = (data.parents as unknown) as { id: string; full_name: string; phone: string } | null
  return p ?? null
}

/**
 * Returns balance (unpaid charges) and 6 months of charge history
 * for the student's primary parent. Returns null parent fields if no parent linked.
 */
export async function getStudentFinancial(
  studentId: string,
  organizationId: string
): Promise<StudentFinancial> {
  const supabase = await createClient()

  // Find primary parent
  const { data: relData } = await supabase
    .from('relationships')
    .select('parent_id, is_primary, parents(id, full_name)')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: billingData } = await supabase
    .from('student_monthly_billing')
    .select('id, billing_month, total_amount, is_paid, is_approved')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .order('billing_month', { ascending: false })
    .limit(6)

  const monthly_billings: StudentMonthlyBilling[] = (billingData ?? []).map((b) => ({
    id: b.id as string,
    billing_month: b.billing_month as string,
    total_amount: Number(b.total_amount),
    is_paid: b.is_paid as boolean,
    is_approved: b.is_approved as boolean,
  }))

  if (!relData) {
    return {
      balance: 0,
      primary_parent_id: null,
      primary_parent_name: null,
      recent_charges: [],
      monthly_billings,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentRow = relData.parents as any
  const parentId = relData.parent_id as string
  const parentName = parentRow?.full_name as string ?? null

  // Balance = sum of pending/invoiced charges
  const { data: unpaidData } = await supabase
    .from('charges')
    .select('amount')
    .eq('parent_id', parentId)
    .eq('organization_id', organizationId)
    .in('status', [...OPEN_CHARGE_STATUSES])

  const balance = (unpaidData ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  // 6 months recent charges
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: chargesData } = await supabase
    .from('charges')
    .select('id, created_at, amount, status, charge_type, notes')
    .eq('parent_id', parentId)
    .eq('organization_id', organizationId)
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  const recent_charges: StudentCharge[] = (chargesData ?? []).map((c) => ({
    id: c.id as string,
    created_at: c.created_at as string,
    amount: Number(c.amount),
    status: c.status as ChargeStatus,
    charge_type: c.charge_type as string,
    notes: c.notes as string | null,
  }))

  return { balance, primary_parent_id: parentId, primary_parent_name: parentName, recent_charges, monthly_billings }
}
