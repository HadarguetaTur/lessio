import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getParentById } from '@/lib/parents'
import { getParentStudents } from '@/lib/relationships'
import { getParentDebt } from '@/lib/charges'
import { ParentDetailPanel } from '@/components/dashboard/parents/ParentDetailPanel'
import { updateParent, sendPaymentRequestAction } from '../../actions'
import { getTranslations } from 'next-intl/server'

export default async function EditParentPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, role } = await getSession()
  if (role === 'teacher') redirect('/parents')

  const [parent, linkedStudents, debt, t] = await Promise.all([
    getParentById(id, orgId),
    getParentStudents(id, orgId),
    getParentDebt(id, orgId),
    getTranslations('parents'),
  ])

  if (!parent) notFound()

  const boundUpdateParent = updateParent.bind(null, parent.id)
  const canSendPaymentRequest = role === 'owner' || role === 'admin'

  return (
    <div className="max-w-2xl space-y-6 pb-8 min-w-0">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground min-w-0" aria-label="Breadcrumb">
        <Link href="/parents" className="hover:text-foreground shrink-0">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <span className="text-foreground font-medium truncate">{parent.full_name}</span>
      </nav>

      <ParentDetailPanel
        parent={parent}
        linkedStudents={linkedStudents}
        debt={debt}
        updateAction={boundUpdateParent}
        paymentAction={sendPaymentRequestAction}
        canSendPaymentRequest={canSendPaymentRequest}
      />
    </div>
  )
}
