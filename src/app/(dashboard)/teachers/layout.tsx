import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

/** People management is an owner/admin surface, including every nested route. */
export default async function TeachersLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/teacher/dashboard')
  return children
}
