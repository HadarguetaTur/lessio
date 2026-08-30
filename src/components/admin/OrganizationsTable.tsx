import Link from 'next/link'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import type { OrgListItem } from '@/lib/superadmin/organizations'
import { OrganizationStatusBadge } from './OrganizationStatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Props {
  orgs: OrgListItem[]
}

function Yn({ value, yesLabel, noLabel }: { value: boolean; yesLabel: string; noLabel: string }) {
  return (
    <span className={value ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
      {value ? yesLabel : noLabel}
    </span>
  )
}

export async function OrganizationsTable({ orgs }: Props) {
  const t = await getTranslations('admin')

  if (orgs.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">{t('orgs.table.empty')}</p>
  }

  const yesLabel = t('orgs.table.yes')
  const noLabel = t('orgs.table.no')

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="hidden h-full overflow-auto md:block" tabIndex={0} aria-label={t('orgs.title')}>
        <Table className="min-w-[900px] text-sm">
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">{t('orgs.table.name')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">Slug</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">{t('orgs.table.status')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">{t('orgs.table.lastActivity')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-center font-medium text-muted-foreground">WhatsApp</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-center font-medium text-muted-foreground">{t('orgs.table.payments')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-center font-medium text-muted-foreground">{t('orgs.table.receipts')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">{t('orgs.table.created')}</TableHead>
              <TableHead className="sticky top-0 z-10 bg-gray-50 px-4 text-start font-medium text-muted-foreground">{t('orgs.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => (
              <TableRow key={o.id} className="hover:bg-gray-50">
                <TableCell className="px-4 py-3 font-medium text-gray-900">{o.name}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.slug}</TableCell>
                <TableCell className="px-4 py-3"><OrganizationStatusBadge status={o.status} /></TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {o.lastActivity
                    ? DateTime.fromISO(o.lastActivity).toRelative({ locale: 'he' })
                    : '—'}
                </TableCell>
                <TableCell className="px-4 py-3 text-center"><Yn value={o.whatsAppConnected} yesLabel={yesLabel} noLabel={noLabel} /></TableCell>
                <TableCell className="px-4 py-3 text-center"><Yn value={o.paymentConnected} yesLabel={yesLabel} noLabel={noLabel} /></TableCell>
                <TableCell className="px-4 py-3 text-center"><Yn value={o.receiptConnected} yesLabel={yesLabel} noLabel={noLabel} /></TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {DateTime.fromISO(o.createdAt).toFormat('dd/MM/yy')}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/orgs/${o.id}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {t('orgs.details')}
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 overflow-y-auto p-3 md:hidden">
        {orgs.map((o) => (
          <article key={o.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-gray-900">{o.name}</h2>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" dir="ltr">{o.slug}</p>
              </div>
              <OrganizationStatusBadge status={o.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><dt className="text-muted-foreground">{t('orgs.table.lastActivity')}</dt><dd className="mt-0.5 text-gray-800">{o.lastActivity ? DateTime.fromISO(o.lastActivity).toRelative({ locale: 'he' }) : '—'}</dd></div>
              <div><dt className="text-muted-foreground">{t('orgs.table.created')}</dt><dd className="mt-0.5 text-gray-800">{DateTime.fromISO(o.createdAt).toFormat('dd/MM/yy')}</dd></div>
              <div><dt className="text-muted-foreground">WhatsApp</dt><dd className="mt-0.5"><Yn value={o.whatsAppConnected} yesLabel={yesLabel} noLabel={noLabel} /></dd></div>
              <div><dt className="text-muted-foreground">{t('orgs.table.payments')}</dt><dd className="mt-0.5"><Yn value={o.paymentConnected} yesLabel={yesLabel} noLabel={noLabel} /></dd></div>
            </dl>
            <Link href={`/admin/orgs/${o.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 hover:text-indigo-900">
              {t('orgs.details')}
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
