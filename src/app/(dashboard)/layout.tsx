import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders — middleware handles this, but protect at layout level too.
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  // Teacher portal is out of scope until Sprint 5 (Decision #12).
  if (profile?.role === 'teacher') {
    redirect('/coming-soon')
  }

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar
        userName={profile?.full_name ?? user.email ?? ''}
        userRole={profile?.role ?? ''}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
