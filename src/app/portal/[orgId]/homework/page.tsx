import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, CheckCircle } from 'lucide-react'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

export default async function PortalHomeworkPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const db = createServiceRoleClient()

  // Get parent's students
  const { data: relationships } = await db
    .from('relationships')
    .select('student_id, students ( full_name )')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  const studentIds = (relationships ?? []).map((r) => r.student_id)

  // Fetch assignments for all children
  type RelRow = { student_id: string; students: { full_name: string } | null }
  const studentNameMap = new Map<string, string>(
    (relationships ?? []).map((r) => {
      const row = r as unknown as RelRow
      return [row.student_id, row.students?.full_name ?? '']
    })
  )

  const { data: assignments } = studentIds.length > 0
    ? await db
        .from('homework_assignments')
        .select('id, title, due_date, status, student_id, sent')
        .eq('organization_id', orgId)
        .eq('sent', true)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] }

  const STATUS_LABEL: Record<string, string> = {
    pending: 'ממתין',
    done: 'הושלם',
    overdue: 'באיחור',
  }
  const STATUS_CLASS: Record<string, string> = {
    pending: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card">
        <h1 className="font-semibold text-foreground text-sm">שיעורי בית</h1>
      </header>

      <main className="flex-1 p-4 space-y-3">
        {(assignments ?? []).length === 0 ? (
          <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
            <FileText size={24} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">אין שיעורי בית</p>
          </div>
        ) : (
          (assignments ?? []).map((asg) => {
            type AsgRow = { id: string; title: string; due_date: string | null; status: string; student_id: string }
            const a = asg as unknown as AsgRow
            return (
              <Link
                key={a.id}
                href={`/portal/${orgId}/homework/${a.id}`}
                className="block bg-card border border-border rounded-xl p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {studentNameMap.get(a.student_id) ?? ''}
                      {a.due_date && ` · עד ${a.due_date}`}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {a.status === 'done' && <CheckCircle size={14} className="text-green-500" />}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CLASS[a.status] ?? ''}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </main>

      <PortalTabBar orgId={orgId} active="homework" />
    </div>
  )
}
