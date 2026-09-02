import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, CheckCircle } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getPortalSession } from '@/lib/portal/session'
import { requirePortalFeature } from '@/lib/portal/features'
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
  await requirePortalFeature(orgId, 'homework')

  const [t, locale] = await Promise.all([
    getTranslations('portal.homework'),
    getLocale(),
  ])
  const intlLocale = toIntlLocale(parseAppLocale(locale))
  const formatDueDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'numeric', year: 'numeric' })
      .format(new Date(`${iso}T12:00:00Z`))

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

  // next-intl throws on missing keys — guard unknown statuses with the raw value.
  const KNOWN_STATUSES = new Set(['pending', 'done', 'overdue'])
  const statusLabel = (status: string) =>
    KNOWN_STATUSES.has(status) ? t(`status.${status}`) : status
  const STATUS_CLASS: Record<string, string> = {
    pending: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
  }

  return (
    <div className="flex flex-col flex-1 pb-20">
      <header className="px-4 py-3.5 border-b border-border bg-card">
        <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4 space-y-3">
        {(assignments ?? []).length === 0 ? (
          <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
            <FileText size={24} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
                      {a.due_date && <> · {t('dueBy', { date: formatDueDate(a.due_date) })}</>}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {a.status === 'done' && <CheckCircle size={14} className="text-green-500" />}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CLASS[a.status] ?? ''}`}>
                      {statusLabel(a.status)}
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
