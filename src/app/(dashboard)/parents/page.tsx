import { Users, Upload } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getParents } from '@/lib/parents'
import { ParentSearch } from '@/components/dashboard/parents/ParentSearch'
import { createParent, updateParent, archiveParent, restoreParent, sendPaymentRequestAction } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { NewParentSheet, ParentRowActions } from '@/components/dashboard/parents/ParentSheet'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function ParentsPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const searchParams = await props.searchParams
  const q = searchParams.q ?? ''

  const { orgId, role } = await getSession()
  const parents = await getParents(orgId, { search: q })
  const canSendPaymentRequest = role === 'owner' || role === 'admin'
  const t = await getTranslations('parents')
  const tCommon = await getTranslations('common')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/parents/import">
              <Button variant="outline" size="sm">
                <Upload size={14} className="ml-1.5" />
                יבוא
              </Button>
            </Link>
            <NewParentSheet action={createParent} />
          </div>
        }
      />

      <ParentSearch q={q} />

      {parents.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Users}
            title={q ? tCommon('emptyStates.noResults') : t('title')}
            subtitle={!q ? t('newParent') : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {t('title')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.phone')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {tCommon('table.status')}
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 w-12 bg-muted/95 px-5 backdrop-blur" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parents.map((parent) => {
                  const updateAction = updateParent.bind(null, parent.id)
                  const archiveAction = archiveParent.bind(null, parent.id)
                  const restoreAction = restoreParent.bind(null, parent.id)
                  return (
                    <TableRow key={parent.id} className="hover:bg-muted/20">
                      <TableCell className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={parent.full_name} />
                          <span className="text-sm font-medium text-foreground">{parent.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3.5 text-sm text-muted-foreground font-mono" dir="ltr">
                        {parent.phone}
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                            parent.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {parent.is_active ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-3.5">
                        <ParentRowActions
                          parent={parent}
                          updateAction={updateAction}
                          archiveAction={archiveAction}
                          restoreAction={restoreAction}
                          paymentAction={sendPaymentRequestAction}
                          canSendPaymentRequest={canSendPaymentRequest}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
