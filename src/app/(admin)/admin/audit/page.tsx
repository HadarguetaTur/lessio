import { requirePlatformSession } from '@/lib/superadmin/session'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { listAdminAuditLog } from '@/lib/superadmin/audit'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'

/**
 * What operators did, and to whom.
 *
 * Per /docs/sprint-34-scope.md § /admin/audit. Support-mode entry, org edits
 * and data exports previously left no trace beyond a console line.
 */
export default async function AdminAuditPage() {
  await requirePlatformSession('audit.read')

  const t = await getTranslations('admin.audit')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()

  const entries = await listAdminAuditLog({ limit: 250 })

  const rows: AdminTableRow[] = entries.map((e) => ({
    id: e.id,
    cells: {
      when: DateTime.fromISO(e.createdAt).setLocale(locale).toFormat('dd LLL, HH:mm'),
      actor: e.actorName ?? <span className="text-muted-foreground">{t('unknownActor')}</span>,
      action: <span className="font-mono text-xs">{e.action}</span>,
      org: e.organizationId ? (
        <Link href={`/admin/orgs/${e.organizationId}`} className="hover:underline">
          {e.organizationName ?? e.organizationId.slice(0, 8)}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('platformWide')}</span>
      ),
      details: (
        <span className="line-clamp-1 font-mono text-xs text-muted-foreground">
          {Object.keys(e.metadata).length > 0 ? JSON.stringify(e.metadata) : ''}
        </span>
      ),
    },
    sortValues: {
      when: e.createdAt,
      actor: e.actorName,
      action: e.action,
      org: e.organizationName,
    },
    csv: {
      when: e.createdAt,
      actor: e.actorName ?? '',
      action: e.action,
      org: e.organizationName ?? '',
      details: JSON.stringify(e.metadata),
    },
  }))

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <AdminTable
        exportName="lessio-admin-audit"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'when', label: t('columns.when'), numeric: true, sortable: true },
          { key: 'actor', label: t('columns.actor'), sortable: true },
          { key: 'action', label: t('columns.action'), sortable: true },
          { key: 'org', label: t('columns.org'), sortable: true },
          { key: 'details', label: t('columns.details'), secondary: true },
        ]}
        rows={rows}
      />
    </div>
  )
}
