import { StudentForm } from '@/components/dashboard/students/StudentForm'
import { createStudent } from '../actions'

export default function NewStudentPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">תלמיד חדש</h1>
      <StudentForm action={createStudent} />
    </div>
  )
}
