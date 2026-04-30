import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { StudentForm } from '@/components/dashboard/students/StudentForm'
import { createStudent } from '../actions'
import { getTranslations } from 'next-intl/server'

export default async function NewStudentPage() {
  const { role, orgId } = await getSession()
  if (role === 'teacher') redirect('/students')

  const supabase = await createClient()
  const { data: teacherRows } = await supabase
    .from('teachers')
    .select('id, profile:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('id', { ascending: true })

  type Row = { id: string; profile: { full_name: string } | null }
  const teachers =
    (teacherRows as Row[] | null)?.map((r) => ({
      id: r.id,
      full_name: r.profile?.full_name ?? '—',
    })) ?? []

  const t = await getTranslations('students')
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newStudent')}</h1>
      <StudentForm action={createStudent} teachers={teachers} />
    </div>
  )
}
