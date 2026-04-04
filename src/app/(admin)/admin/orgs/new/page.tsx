import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { NewOrganizationForm } from '@/components/admin/NewOrganizationForm'
import { createOrganizationAction } from '../actions'

/**
 * Create new organization — superadmin only.
 * Per /docs/sprint-18-scope.md § Story 4.
 */
export default function NewOrganizationPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowRight size={13} />
        חזרה לרשימה
      </Link>
      <AdminHeader title="ארגון חדש" description="יצירת ארגון + הזמנת בעלים" />
      <NewOrganizationForm action={createOrganizationAction} />
    </div>
  )
}
