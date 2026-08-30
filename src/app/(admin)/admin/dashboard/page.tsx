import { redirect } from 'next/navigation'

/**
 * Sprint 18 shipped the platform dashboard at /admin/dashboard and left /admin
 * itself a 404. Sprint 34 moved the overview to /admin; this keeps every
 * existing bookmark, notification link and muscle-memory URL working.
 */
export default function AdminDashboardRedirect() {
  redirect('/admin')
}
