import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createTeacherLessonAction } from './actions'

export default async function TeacherNewLessonPage() {
  const { orgId, profileId, role } = await getSession()
  if (role !== 'teacher') redirect('/teacher/schedule')

  const [teacher, students] = await Promise.all([
    getTeacherByProfileId(profileId, orgId),
    getStudents(orgId),
  ])

  if (!teacher) redirect('/teacher/schedule')

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">שיעור חדש</h1>
      <NewLessonForm
        students={activeStudents}
        fixedTeacherId={teacher.id}
        action={createTeacherLessonAction}
      />
    </div>
  )
}
