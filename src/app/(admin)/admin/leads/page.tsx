import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { listLeads } from '@/lib/outbound/leads'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'

/**
 * /admin/leads — Lessio's own sales leads (platform_leads).
 *
 * Phase A is read-only: the point is that a prospect who answered "yes" shows
 * up here on their own. Status controls, owner assignment and the pipeline view
 * are Sprint 34 M3 / Phase B.
 */

export default async function AdminLeadsPage() {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.leads')
  const locale = await getLocale()

  const leads = await listLeads(500)

  const rows: AdminTableRow[] = leads.map((lead) => ({
    id: lead.id,
    cells: {
      name: lead.name ?? '—',
      email: (
        <span className="font-mono text-xs" dir="ltr">
          {lead.email ?? '—'}
        </span>
      ),
      company: lead.company ?? '—',
      status: <ProspectStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />,
      source: [lead.source, lead.campaign].filter(Boolean).join(' · ') || '—',
      createdAt: DateTime.fromISO(lead.created_at).setLocale(locale).toFormat('dd.MM.yyyy HH:mm'),
      notes: lead.notes ? (
        <span className="line-clamp-1 text-xs" title={lead.notes}>
          {lead.notes}
        </span>
      ) : (
        '—'
      ),
    },
    sortValues: {
      name: lead.name,
      email: lead.email,
      company: lead.company,
      status: lead.status,
      source: lead.source,
      createdAt: lead.created_at,
    },
    csv: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      status: lead.status,
      source: lead.source,
      campaign: lead.campaign,
      created_at: lead.created_at,
      notes: lead.notes,
    },
  }))

  const newCount = leads.filter((l) => l.status === 'new').length

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <p className="mb-3 text-xs text-muted-foreground tabular-nums">{t('newCount', { count: newCount })}</p>

      <AdminTable
        exportName="lessio-leads"
        emptyLabel={t('empty')}
        columns={[
          { key: 'name', label: t('columns.name'), sortable: true },
          { key: 'email', label: t('columns.email'), sortable: true },
          { key: 'company', label: t('columns.company'), sortable: true, secondary: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'source', label: t('columns.source'), sortable: true, secondary: true },
          { key: 'createdAt', label: t('columns.createdAt'), numeric: true, sortable: true },
          { key: 'notes', label: t('columns.notes'), secondary: true },
        ]}
        rows={rows}
      />
    </div>
  )
}
