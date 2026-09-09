import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { Megaphone, Plus } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { MessagesTabs } from '@/components/dashboard/messages/MessagesTabs'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Every broadcast this org has sent, newest first.
 *
 * Owners and admins only — a teacher's lesson update is raised and reported on
 * the lesson itself, which is the only context where it makes sense to them.
 */
export default async function BroadcastsPage() {
  const t = await getTranslations('broadcasts')
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin') forbidden()

  const db = createServiceRoleClient()
  const [{ data }, timezone] = await Promise.all([
    db
      .from('broadcast_campaigns')
      .select(
        'id, name, template_type, status, recipients_total, sent_count, skipped_count, failed_count, created_at, scheduled_at'
      )
      .eq('organization_id', session.orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    getOrgTimezone(session.orgId),
  ])

  const campaigns = (data ?? []) as Array<{
    id: string
    name: string
    template_type: string
    status: string
    recipients_total: number
    sent_count: number
    skipped_count: number
    failed_count: number
    created_at: string
    scheduled_at: string | null
  }>

  return (
    <div className="space-y-6">
      <LiveRefresh tables={['broadcast_campaigns']} />
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link
            href="/messages/broadcasts/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={16} />
            {t('new')}
          </Link>
        }
      />
      <MessagesTabs />

      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colName')}</TableHead>
                <TableHead>{t('colType')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead>{t('colResult')}</TableHead>
                <TableHead>{t('colDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/messages/broadcasts/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(`types.${c.template_type}`)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{t(`statuses.${c.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums" dir="ltr">
                    {t('resultSummary', {
                      sent: c.sent_count,
                      skipped: c.skipped_count,
                      failed: c.failed_count,
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {DateTime.fromISO(c.scheduled_at ?? c.created_at)
                      .setZone(timezone)
                      .toFormat('dd.MM.yyyy HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'sent') return 'default'
  if (status === 'failed' || status === 'cancelled') return 'destructive'
  if (status === 'sending' || status === 'scheduled') return 'secondary'
  return 'outline'
}
