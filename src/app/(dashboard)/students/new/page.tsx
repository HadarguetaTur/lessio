import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { StudentForm } from '@/components/dashboard/students/StudentForm'
import { createStudent } from '../actions'
import { getTranslations } from 'next-intl/server'

export default async function NewStudentPage() {
  const { role } = await getSession()
  if (role === 'teacher') redirect('/students')

  const t = await getTranslations('students')
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newStudent')}</h1>
      <StudentForm action={createStudent} />
    </div>
  )
}
