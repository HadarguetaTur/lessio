import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface Teacher {
  id: string
  bio: string | null
  hourly_rate: number | null
  /** Minutes needed between lessons. NULL follows the organization default. */
  break_duration_minutes: number | null
  is_active: boolean
  created_at: string
  profile: {
    id: string
    full_name: string
    /** Normalized E.164. Also how the WhatsApp bot recognises them as a teacher. */
    phone: string | null
  }
}

type TeacherRow = {
  id: string
  bio: string | null
  hourly_rate: number | null
  break_duration_minutes: number | null
  is_active: boolean
  created_at: string
  profiles: unknown
}

/** The column list every teacher read shares. */
const TEACHER_COLUMNS =
  'id, bio, hourly_rate, break_duration_minutes, is_active, created_at, profiles(id, full_name, phone)'

function mapTeacher(data: TeacherRow): Teacher {
  return {
    id: data.id,
    bio: data.bio,
    hourly_rate: data.hourly_rate ?? null,
    break_duration_minutes: data.break_duration_minutes ?? null,
    is_active: data.is_active,
    created_at: data.created_at,
    profile: (data.profiles as unknown) as { id: string; full_name: string; phone: string | null },
  }
}

export async function getTeachers(organizationId: string): Promise<Teacher[]> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('teachers')
    .select(TEACHER_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((t) => mapTeacher(t as TeacherRow))
}

/**
 * How many active teachers the org has.
 *
 * Onboarding always creates a teacher record for the owner, so a solo tutor
 * has exactly 1 — which is what lets the UI drop "which teacher?" from forms
 * and navigation instead of asking a question with one possible answer.
 */
export async function getActiveTeacherCount(organizationId: string): Promise<number> {
  const supabase = createServiceRoleClient()

  const { count, error } = await supabase
    .from('teachers')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function getTeacherByProfileId(
  profileId: string,
  organizationId: string,
  options?: { activeOnly?: boolean }
): Promise<Teacher | null> {
  const supabase = createServiceRoleClient()

  let query = supabase
    .from('teachers')
    .select(TEACHER_COLUMNS)
    .eq('profile_id', profileId)
    .eq('organization_id', organizationId)
  if (options?.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data } = await query.single()

  if (!data) return null

  return mapTeacher(data as TeacherRow)
}

export async function getTeacherById(
  id: string,
  organizationId: string
): Promise<Teacher | null> {
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('teachers')
    .select(TEACHER_COLUMNS)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (!data) return null

  return mapTeacher(data as TeacherRow)
}
