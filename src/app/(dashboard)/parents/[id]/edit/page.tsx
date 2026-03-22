import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getParentById } from '@/lib/parents'
import { ParentForm } from '@/components/dashboard/parents/ParentForm'
import { updateParent } from '../../actions'

export default async function EditParentPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId } = await getSession()

  const parent = await getParentById(id, orgId)
  if (!parent) notFound()

  const boundUpdateParent = updateParent.bind(null, parent.id)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">עריכת הורה</h1>
      <ParentForm
        action={boundUpdateParent}
        defaultValues={{
          full_name: parent.full_name,
          phone: parent.phone,
          notes: parent.notes,
        }}
      />
    </div>
  )
}
