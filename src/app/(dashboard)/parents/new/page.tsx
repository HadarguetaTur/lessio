import { ParentForm } from '@/components/dashboard/parents/ParentForm'
import { createParent } from '../actions'

export default function NewParentPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">הורה חדש</h1>
      <ParentForm action={createParent} />
    </div>
  )
}
