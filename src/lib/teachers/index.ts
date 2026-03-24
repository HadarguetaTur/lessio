import { createClient } from '@/lib/supabase/server'

export interface Teacher {
  id: string
  bio: string | null
  hourly_rate: number | null
  is_active: boolean
  created_at: string
  profile: {
    id: string
    full_name: string
  }
}

type TeacherRow = {
  id: string
  bio: string | null
  hourly_rate: number | null
  is_active: boolean
  created_at: string
  profiles: unknown
}

function mapTeacher(data: TeacherRow): Teacher {
  return {
    id: data.id,
    bio: data.bio,
    hourly_rate: data.hourly_rate ?? null,
    is_active: data.is_active,
    created_at: data.created_at,
    profile: (data.profiles as unknown) as { id: string; full_name: string },
  }
}

export async function getTeachers(organizationId: string): Promise<Teacher[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teachers')
    .select('id, bio, hourly_rate, is_active, created_at, profiles(id, full_name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((t) => mapTeacher(t as TeacherRow))
}

export async function getTeacherByProfileId(
  profileId: string,
  organizationId: string,
  options?: { activeOnly?: boolean }
): Promise<Teacher | null> {
  const supabase = await createClient()

  let query = supabase
    .from('teachers')
    .select('id, bio, hourly_rate, is_active, created_at, profiles(id, full_name)')
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
  const supabase = await createClient()

  const { data } = await supabase
    .from('teachers')
    .select('id, bio, hourly_rate, is_active, created_at, profiles(id, full_name)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (!data) return null

  return mapTeacher(data as TeacherRow)
}
