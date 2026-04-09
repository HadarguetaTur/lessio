import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getStudentById } from '@/lib/students'
import { StudentForm } from '@/components/dashboard/students/StudentForm'
import { updateStudent } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditStudentPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const student = await getStudentById(id, orgId)
  if (!student) notFound()

  const boundUpdateStudent = updateStudent.bind(null, student.id)

  const t = await getTranslations('students')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('editStudent')}</h1>
      <StudentForm
        action={boundUpdateStudent}
        defaultValues={{
          full_name: student.full_name,
          grade: student.grade,
          notes: student.notes,
        }}
      />
    </div>
  )
}
