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
      <div className="h-full overflow-auto">
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
    </div>
  )
}
