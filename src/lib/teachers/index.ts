import { createClient } from '@/lib/supabase/server'

export interface Teacher {
  id: string
  bio: string | null
  is_active: boolean
  created_at: string
  profile: {
    id: string
    full_name: string
  }
}

export async function getTeachers(organizationId: string): Promise<Teacher[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teachers')
    .select('id, bio, is_active, created_at, profiles(id, full_name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((t) => ({
    id: t.id,
    bio: t.bio,
    is_active: t.is_active,
    created_at: t.created_at,
    profile: (t.profiles as unknown) as { id: string; full_name: string },
  }))
}

export async function getTeacherById(
  id: string,
  organizationId: string
): Promise<Teacher | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('teachers')
    .select('id, bio, is_active, created_at, profiles(id, full_name)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (!data) return null

  return {
    id: data.id,
    bio: data.bio,
    is_active: data.is_active,
    created_at: data.created_at,
    profile: (data.profiles as unknown) as { id: string; full_name: string },
  }
}
