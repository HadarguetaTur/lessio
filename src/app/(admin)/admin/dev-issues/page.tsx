import Link from 'next/link'
import { getTranslations, getFormatter } from 'next-intl/server'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { listDevIssues, type DevIssueFilter } from '@/lib/superadmin/devIssues'
import { DevIssueStatusBadge } from '@/components/admin/DevIssueStatusBadge'
import { cn } from '@/lib/utils'

const FILTERS: DevIssueFilter[] = ['open', 'fixed', 'wont_fix', 'all']

export default async function AdminDevIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  await requireSuperAdminSession()
  const { filter } = await searchParams
  const t = await getTranslations('admin.devIssues')
  const format = await getFormatter()

  const active: DevIssueFilter = FILTERS.includes(filter as DevIssueFilter)
    ? (filter as DevIssueFilter)
    : 'open'
  const issues = await listDevIssues(active)

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden">
      <AdminHeader title={t('title')} description={t('description')} />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('filterLabel')}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'open' ? '/admin/dev-issues' : `/admin/dev-issues?filter=${f}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active === f
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            )}
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>

      {issues.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          {issues.map((issue) => (
            <li key={issue.id}>
              <Link
                href={`/admin/dev-issues/${issue.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-foreground">{issue.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('occurrences', { events: issue.event_count, orgs: issue.org_count })}
                    {issue.last_seen
                      ? ` · ${t('lastSeen', {
                          date: format.dateTime(new Date(issue.last_seen), {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }),
                        })}`
                      : ''}
                  </p>
                </div>
                <DevIssueStatusBadge status={issue.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
