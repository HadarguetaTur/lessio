import Link from 'next/link'
import { DateTime } from 'luxon'
import { getLocale, getTranslations } from 'next-intl/server'

import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { OrgListItem } from '@/lib/superadmin/organizations'
import { AdminTable, type AdminTableRow } from './AdminTable'
import { OrganizationStatusBadge } from './OrganizationStatusBadge'
import { cn } from '@/lib/utils'

/**
 * The tenant list.
 *
 * Per /docs/sprint-34-scope.md § /admin/orgs. Rebuilt on AdminTable, which
 * brings sorting, paging and CSV export. Three things changed beyond that:
 * plan, MRR and quota pressure are now columns — an operator's first questions
 * about a tenant, previously answerable only by opening the record; relative
 * dates use the request's locale instead of a hardcoded 'he'; and connection
 * state collapsed from three yes/no columns into one, since "which of the three
 * is missing" is a detail-page question.
 */

interface Props {
  orgs: OrgListItem[]
}

/** Quota usage reads as a colour before it reads as a number. */
function quotaTone(ratio: number | null): string {
  if (ratio == null) return 'text-muted-foreground'
  if (ratio >= 1) return 'text-destructive font-medium'
  if (ratio >= 0.8) return 'text-amber-600 font-medium'
  return ''
}

export async function OrganizationsTable({ orgs }: Props) {
  const t = await getTranslations('admin')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()

  const rows: AdminTableRow[] = orgs.map((o) => {
    const connected = [o.whatsAppConnected, o.paymentConnected, o.receiptConnected].filter(
      Boolean
    ).length

    return {
      id: o.id,
      cells: {
        name: (
          <Link href={`/admin/orgs/${o.id}`} className="font-medium hover:underline">
            {o.name}
            <span className="ms-2 font-mono text-xs font-normal text-muted-foreground" dir="ltr">
              {o.slug}
            </span>
          </Link>
        ),
        plan: o.planLabelHe ? (
          <span>{locale === 'he' ? o.planLabelHe : o.planLabelEn}</span>
        ) : (
          <span className="text-muted-foreground">{t('orgs.table.noPlan')}</span>
        ),
        status: <OrganizationStatusBadge status={o.status} />,
        mrr: o.monthlyValue > 0 ? formatMoney(Math.round(o.monthlyValue), locale) : null,
        students: (
          <span className={quotaTone(o.quota.worstRatio)}>
            {o.quota.studentsUsed}
            {o.quota.studentsLimit != null && (
              <span className="opacity-60">{` / ${o.quota.studentsLimit}`}</span>
            )}
          </span>
        ),
        lessons: o.quota.lessonsUsed,
        connections: (
          <span className={cn(connected === 3 ? 'text-emerald-600' : 'text-muted-foreground')}>
            {connected}/3
          </span>
        ),
        lastActivity: o.lastActivity
          ? DateTime.fromISO(o.lastActivity).setLocale(locale).toRelative()
          : null,
        created: DateTime.fromISO(o.createdAt).setLocale(locale).toFormat('dd LLL yy'),
      },
      sortValues: {
        name: o.name,
        plan: o.planName,
        status: o.status,
        mrr: o.monthlyValue,
        students: o.quota.studentsUsed,
        lessons: o.quota.lessonsUsed,
        connections: connected,
        lastActivity: o.lastActivity,
        created: o.createdAt,
      },
      csv: {
        name: o.name,
        slug: o.slug,
        plan: o.planName ?? '',
        subscriptionStatus: o.subscriptionStatus ?? '',
        status: o.status,
        mrr: Math.round(o.monthlyValue),
        students: o.quota.studentsUsed,
        studentsLimit: o.quota.studentsLimit ?? '',
        lessons: o.quota.lessonsUsed,
        connections: `${connected}/3`,
        lastActivity: o.lastActivity ?? '',
        created: o.createdAt,
      },
    }
  })

  return (
    <AdminTable
      exportName="lessio-organizations"
      emptyLabel={tTable('empty')}
      columns={[
        { key: 'name', label: t('orgs.table.name'), sortable: true },
        { key: 'plan', label: t('orgs.table.plan'), sortable: true },
        { key: 'status', label: t('orgs.table.status'), sortable: true },
        { key: 'mrr', label: t('orgs.table.mrr'), numeric: true, align: 'end', sortable: true },
        {
          key: 'students',
          label: t('orgs.table.students'),
          numeric: true,
          align: 'end',
          sortable: true,
        },
        {
          key: 'lessons',
          label: t('orgs.table.lessons'),
          numeric: true,
          align: 'end',
          sortable: true,
          secondary: true,
        },
        {
          key: 'connections',
          label: t('orgs.table.connections'),
          numeric: true,
          align: 'end',
          sortable: true,
          secondary: true,
        },
        {
          key: 'lastActivity',
          label: t('orgs.table.lastActivity'),
          numeric: true,
          sortable: true,
        },
        {
          key: 'created',
          label: t('orgs.table.created'),
          numeric: true,
          sortable: true,
          secondary: true,
        },
      ]}
      rows={rows}
    />
  )
}
