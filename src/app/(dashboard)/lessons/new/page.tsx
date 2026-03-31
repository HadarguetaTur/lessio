import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createLessonAction } from './actions'

export default async function NewLessonPage() {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/lessons')

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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">שיעור חד פעמי</h1>
      <NewLessonForm
        teachers={activeTeachers}
        students={activeStudents}
        action={createLessonAction}
      />
    </div>
  )
}
