import { TeacherInviteForm } from '@/components/dashboard/teachers/TeacherInviteForm'
import { inviteTeacher } from '../actions'

export default function InviteTeacherPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">הזמנת מורה</h1>
      <p className="text-sm text-gray-500 mb-6">
        המורה יקבל אימייל עם קישור להרשמה. לאחר ההרשמה, פרופיל המורה יהיה פעיל במערכת.
      </p>
      <TeacherInviteForm action={inviteTeacher} />
    </div>
  )
}
