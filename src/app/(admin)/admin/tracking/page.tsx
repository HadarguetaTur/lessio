import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  SERVER_SIDE_PROVIDERS,
  TRACKING_PROVIDERS,
  listDestinations,
} from '@/lib/tracking/destinations'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import {
  SendTestEventButton,
  TrackingDestinationCard,
} from '@/components/admin/TrackingDestinationCard'
import {
  deleteDestinationAction,
  saveDestinationAction,
  sendTestEventAction,
} from './actions'
import { cn } from '@/lib/utils'

/**
 * Where conversion events go, and whether they arrived.
 *
 * Per /docs/sprint-34-scope.md § C. The delivery log is the point: without it
 * "did Meta receive this" is a guess made by staring at Events Manager.
 */

type DeliveryRow = {
  id: string
  event_name: string
  event_id: string
  status: string
  error: string | null
  created_at: string
  tracking_destinations: { label: string; provider: string } | null
}

export default async function AdminTrackingPage() {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.tracking')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()

  const db = createServiceRoleClient()
  const since = DateTime.utc().minus({ hours: 24 }).toISO()!

  const [destinations, deliveriesRes] = await Promise.all([
    listDestinations(),
    db
      .from('tracking_events')
      .select(
        'id, event_name, event_id, status, error, created_at, tracking_destinations ( label, provider )'
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const deliveries = (deliveriesRes.data ?? []) as unknown as DeliveryRow[]

  const rows: AdminTableRow[] = deliveries.map((d) => ({
    id: d.id,
    cells: {
      when: DateTime.fromISO(d.created_at).setLocale(locale).toFormat('HH:mm:ss'),
      event: <span className="font-mono text-xs">{d.event_name}</span>,
      destination: d.tracking_destinations?.label ?? '—',
      status: (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            d.status === 'sent' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            d.status === 'pending' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            d.status === 'failed' && 'bg-destructive/10 text-destructive'
          )}
        >
          {t(`status.${d.status}`)}
        </span>
      ),
      detail: d.error ? (
        <span className="line-clamp-1 font-mono text-xs text-destructive" title={d.error}>
          {d.error}
        </span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{d.event_id.slice(0, 8)}</span>
      ),
    },
    sortValues: { when: d.created_at, event: d.event_name, status: d.status },
    csv: {
      when: d.created_at,
      event: d.event_name,
      eventId: d.event_id,
      destination: d.tracking_destinations?.label ?? '',
      status: d.status,
      error: d.error ?? '',
    },
  }))

  const failures = deliveries.filter((d) => d.status === 'failed').length

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={t('title')}
        subtitle={t('description')}
        actions={<SendTestEventButton action={sendTestEventAction} />}
      />

      <p className="mb-5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t('idsInDbNote')}
      </p>

      <div className="mb-8 space-y-4">
        {destinations.map((destination) => (
          <TrackingDestinationCard
            key={destination.id}
            destination={destination}
            providers={[...TRACKING_PROVIDERS]}
            serverSideProviders={SERVER_SIDE_PROVIDERS}
            saveAction={saveDestinationAction}
            deleteAction={deleteDestinationAction}
          />
        ))}

        <TrackingDestinationCard
          providers={[...TRACKING_PROVIDERS]}
          serverSideProviders={SERVER_SIDE_PROVIDERS}
          saveAction={saveDestinationAction}
          deleteAction={deleteDestinationAction}
        />
      </div>

      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('deliveryLog')}</h2>
        {failures > 0 && (
          <span className="text-xs font-medium text-destructive tabular-nums">
            {t('failuresInWindow', { count: failures })}
          </span>
        )}
      </div>

      <AdminTable
        exportName="lessio-tracking-deliveries"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'when', label: t('columns.when'), numeric: true, sortable: true },
          { key: 'event', label: t('columns.event'), sortable: true },
          { key: 'destination', label: t('columns.destination'), sortable: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'detail', label: t('columns.detail'), secondary: true },
        ]}
        rows={rows}
      />
    </div>
  )
}
