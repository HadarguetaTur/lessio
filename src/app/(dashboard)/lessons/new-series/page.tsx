import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewSeriesForm } from '@/components/dashboard/lessons/NewSeriesForm'

export default async function NewSeriesPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    redirect('/lessons')
  }

  const [teachers, students] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">יצירת שיעורים קבועים</h1>
      <NewSeriesForm teachers={activeTeachers} students={activeStudents} />
    </div>
  )
}
