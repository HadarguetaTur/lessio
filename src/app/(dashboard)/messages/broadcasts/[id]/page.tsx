import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { deliveryFailureReason } from '@/lib/whatsapp/deliveryErrorCopy'
import { SectionHeader } from '@/components/inbox/SectionHeader'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BroadcastControls } from '@/components/dashboard/broadcasts/BroadcastControls'
import { updateBroadcastStatusAction } from '../actions'

/**
 * The delivery report.
 *
 * The point of this page is the skipped column: a week later somebody asks why
 * one parent did not hear about the cancelled lesson, and the answer has to be
 * on the screen rather than in a log.
 */
export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const t = await getTranslations('broadcasts')
  // Same wording as the conversation thread: a failed delivery says why, not
  // which number Meta used for it.
  const tDelivery = await getTranslations('waConversations.delivery')
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') forbidden()

  const { id } = await params
  const db = createServiceRoleClient()

  const [{ data: campaignData }, timezone] = await Promise.all([
    db
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', session.orgId)
      .maybeSingle(),
    getOrgTimezone(session.orgId),
  ])

  if (!campaignData) notFound()
  const campaign = campaignData as {
    id: string
    name: string
    template_type: string
    topic: string | null
    message: string | null
    status: string
    paused_reason: string | null
    recipients_total: number
    sent_count: number
    skipped_count: number
    failed_count: number
    created_at: string
    scheduled_at: string | null
  }

  const { data: recipientData } = await db
    .from('broadcast_recipients')
    .select('id, display_name, phone, status, skip_reason, error_code, sent_at, wa_message_id')
    .eq('campaign_id', id)
    .order('status', { ascending: true })
    .order('sent_at', { ascending: true })
    .limit(500)

  const recipients = (recipientData ?? []) as Array<{
    id: string
    display_name: string | null
    phone: string
    status: string
    skip_reason: string | null
    error_code: number | null
    sent_at: string | null
    wa_message_id: string | null
  }>

  // Delivery receipts live on the transcript rows, keyed by the id Meta gave us
  // when it accepted the send.
  const waIds = recipients.map((r) => r.wa_message_id).filter((x): x is string => Boolean(x))
  const deliveryByWaId = new Map<string, string>()
  if (waIds.length > 0) {
    const { data: messages } = await db
      .from('whatsapp_messages')
      .select('wa_message_id, status')
      .eq('organization_id', session.orgId)
      .in('wa_message_id', waIds)
    for (const m of (messages ?? []) as Array<{ wa_message_id: string | null; status: string | null }>) {
      if (m.wa_message_id && m.status) deliveryByWaId.set(m.wa_message_id, m.status)
    }
  }

  return (
    <div className="space-y-6">
      <LiveRefresh tables={['broadcast_campaigns', 'broadcast_recipients']} />
      <SectionHeader
        title={campaign.name}
        subtitle={t(`types.${campaign.template_type}`)}
        actions={
          <BroadcastControls
            campaignId={campaign.id}
            status={campaign.status}
            action={updateBroadcastStatusAction}
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('stats.total')} value={campaign.recipients_total} />
        <Stat label={t('stats.sent')} value={campaign.sent_count} />
        <Stat label={t('stats.skipped')} value={campaign.skipped_count} />
        <Stat label={t('stats.failed')} value={campaign.failed_count} />
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={campaign.status === 'sent' ? 'default' : 'secondary'}>
            {t(`statuses.${campaign.status}`)}
          </Badge>
          {campaign.scheduled_at && (
            <span className="text-xs text-muted-foreground">
              {t('scheduledFor', {
                when: DateTime.fromISO(campaign.scheduled_at)
                  .setZone(timezone)
                  .toFormat('dd.MM.yyyy HH:mm'),
              })}
            </span>
          )}
        </div>
        {campaign.paused_reason && (
          <p className="text-xs text-amber-700">{t(`blocked.${campaign.paused_reason.split(':')[0]}`)}</p>
        )}
        {campaign.message && (
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{campaign.message}</p>
        )}
      </section>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colRecipient')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead>{t('colDelivery')}</TableHead>
              <TableHead>{t('colDate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/messages/whatsapp/${encodeURIComponent(r.phone)}`} className="hover:underline">
                    {r.display_name ?? r.phone}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  {r.status === 'skipped' && r.skip_reason ? (
                    <span className="text-muted-foreground">{t(`skipReasons.${r.skip_reason}`)}</span>
                  ) : r.status === 'failed' ? (
                    <span className="text-destructive">
                      {(() => {
                        const reason = deliveryFailureReason(r.error_code)
                        return reason ? tDelivery(`reasons.${reason}`) : tDelivery('failed')
                      })()}
                    </span>
                  ) : (
                    t(`recipientStatuses.${r.status}`)
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.wa_message_id && deliveryByWaId.get(r.wa_message_id)
                    ? t(`delivery.${deliveryByWaId.get(r.wa_message_id)}`)
                    : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.sent_at
                    ? DateTime.fromISO(r.sent_at).setZone(timezone).toFormat('dd.MM HH:mm')
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
