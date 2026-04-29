import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getStudentById } from '@/lib/students'
import { getTeachers } from '@/lib/teachers'
import { StudentForm } from '@/components/dashboard/students/StudentForm'
import { updateStudent } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditStudentPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const [student, teachers] = await Promise.all([
    getStudentById(id, orgId),
    getTeachers(orgId),
  ])
  if (!student) notFound()

  const boundUpdateStudent = updateStudent.bind(null, student.id)

  const teacherOptions = teachers
    .filter((tch) => tch.is_active)
    .map((tch) => ({ id: tch.id, full_name: tch.profile.full_name }))

  const t = await getTranslations('students')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('editStudent')}</h1>
      <StudentForm
        variant="edit"
        action={boundUpdateStudent}
        teachers={teacherOptions}
        defaultValues={{
          full_name: student.full_name,
          grade: student.grade,
          notes: student.notes,
          phone: student.phone,
          level: student.level,
          focused_subject: student.focused_subject,
          weekly_quota: student.weekly_quota,
          status: student.status,
          teacher_id: student.teacher_id,
        }}
      />
    </div>
  )
}
