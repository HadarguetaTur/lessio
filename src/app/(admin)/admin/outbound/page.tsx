import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listCampaigns } from '@/lib/outbound/campaigns'
import { getOutboundStats } from '@/lib/outbound/stats'
import { listMailboxesWithUsage } from '@/lib/outbound/mailboxes'
import { isServiceAccountConfigured } from '@/lib/gmail/serviceAccount'
import { PROSPECT_STATUSES, type InboundMessageRow, type Prospect, type ProspectStatus } from '@/lib/outbound/types'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { OutboundCampaignForm } from '@/components/admin/OutboundCampaignForm'
import { OutboundImportForm } from '@/components/admin/OutboundImportForm'
import { OutboundMailboxesCard } from '@/components/admin/OutboundMailboxesCard'
import { OutboundSuppressionForm } from '@/components/admin/OutboundSuppressionForm'
import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import { cn } from '@/lib/utils'
import {
  addSuppressionAction,
  importProspectsAction,
  saveCampaignAction,
  saveMailboxAction,
  sendMailboxTestAction,
} from './actions'

/**
 * /admin/outbound — the cold-email engine's one screen.
 *
 * Four numbers, the mailbox pool, the campaign copy, a CSV upload, a
 * suppression box, the prospect list, and the last replies (so an `unknown`
 * classification is read by a person). Lead status work lives on /admin/leads.
 */

type ProspectListRow = Pick<
  Prospect,
  'id' | 'email' | 'first_name' | 'last_name' | 'company' | 'status' | 'sent_at' | 'replied_at' | 'last_reply_class' | 'created_at' | 'campaign_id'
>

const STATUS_FILTERS = ['all', ...PROSPECT_STATUSES] as const

export default async function AdminOutboundPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.outbound')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()
  const { status: statusParam } = await searchParams
  const statusFilter = (PROSPECT_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? (statusParam as ProspectStatus)
    : null

  const db = createServiceRoleClient()

  let prospectsQuery = db
    .from('outbound_prospects')
    .select('id, email, first_name, last_name, company, status, sent_at, replied_at, last_reply_class, created_at, campaign_id')
    .order('created_at', { ascending: false })
    .limit(500)
  if (statusFilter) prospectsQuery = prospectsQuery.eq('status', statusFilter)

  const [stats, campaigns, mailboxes, prospectsRes, repliesRes] = await Promise.all([
    getOutboundStats(),
    listCampaigns(),
    listMailboxesWithUsage(),
    prospectsQuery,
    db
      .from('outbound_messages')
      .select('id, prospect_id, from_email, subject, body, classification, created_at')
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const prospects = (prospectsRes.data ?? []) as ProspectListRow[]
  const replies = (repliesRes.data ?? []) as InboundMessageRow[]
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]))

  const fmt = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setLocale(locale).toFormat('dd.MM HH:mm') : '—'
  const polledAt = Object.fromEntries(mailboxes.map((m) => [m.id, fmt(m.last_polled_at)]))

  const prospectRows: AdminTableRow[] = prospects.map((p) => ({
    id: p.id,
    cells: {
      email: (
        <span className="font-mono text-xs" dir="ltr">
          {p.email}
        </span>
      ),
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || '—',
      company: p.company ?? '—',
      campaign: campaignName.get(p.campaign_id) ?? '—',
      status: <ProspectStatusBadge status={p.status} label={t(`status.${p.status}`)} />,
      sentAt: fmt(p.sent_at),
      reply: p.last_reply_class ? (
        <ProspectStatusBadge status={p.last_reply_class} label={t(`classification.${p.last_reply_class}`)} />
      ) : (
        '—'
      ),
    },
    sortValues: {
      email: p.email,
      name: p.first_name ?? '',
      company: p.company ?? '',
      status: p.status,
      sentAt: p.sent_at,
      reply: p.last_reply_class,
    },
    csv: {
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      company: p.company,
      campaign: campaignName.get(p.campaign_id) ?? '',
      status: p.status,
      sent_at: p.sent_at,
      replied_at: p.replied_at,
      last_reply_class: p.last_reply_class,
    },
  }))

  const replyRows: AdminTableRow[] = replies.map((m) => ({
    id: m.id,
    cells: {
      when: fmt(m.created_at),
      from: (
        <span className="font-mono text-xs" dir="ltr">
          {m.from_email ?? '—'}
        </span>
      ),
      classification: (
        <ProspectStatusBadge
          status={m.classification ?? 'unknown'}
          label={t(`classification.${m.classification ?? 'unknown'}`)}
        />
      ),
      snippet: (
        <span className="line-clamp-2 text-xs" title={m.body ?? ''}>
          {m.body ?? m.subject ?? '—'}
        </span>
      ),
    },
    sortValues: { when: m.created_at, from: m.from_email, classification: m.classification },
    csv: {
      when: m.created_at,
      from: m.from_email,
      subject: m.subject,
      classification: m.classification,
      snippet: m.body,
    },
  }))

  const stat = (label: string, value: number) => (
    <div className="rounded-xl border border-border bg-background p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(t('stats.queued'), stats.queued)}
        {stat(t('stats.sent7d'), stats.sent7d)}
        {stat(t('stats.replies7d'), stats.replies7d)}
        {stat(t('stats.interested7d'), stats.interested7d)}
      </div>

      <div className="mb-8">
        <OutboundMailboxesCard
          mailboxes={mailboxes}
          serviceAccountConfigured={isServiceAccountConfigured()}
          formatDate={polledAt}
          saveAction={saveMailboxAction}
          testAction={sendMailboxTestAction}
        />
      </div>

      <div className="mb-8 space-y-4">
        {campaigns.map((campaign) => (
          <OutboundCampaignForm key={campaign.id} campaign={campaign} action={saveCampaignAction} />
        ))}
        <OutboundCampaignForm action={saveCampaignAction} />
      </div>

      <div className="mb-8">
        <OutboundImportForm campaigns={campaigns} action={importProspectsAction} />
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-base font-semibold">{t('suppression.title')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('suppression.description')}</p>
        <OutboundSuppressionForm action={addSuppressionAction} />
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('prospects.title')}</h2>
        <nav className="flex flex-wrap gap-1 text-xs" aria-label={t('prospects.filter')}>
          {STATUS_FILTERS.map((s) => {
            const active = s === 'all' ? !statusFilter : statusFilter === s
            return (
              <Link
                key={s}
                href={s === 'all' ? '/admin/outbound' : `/admin/outbound?status=${s}`}
                className={cn(
                  'rounded-full px-2.5 py-1',
                  active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'all' ? t('prospects.all') : t(`status.${s}`)}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mb-10">
        <AdminTable
          exportName="lessio-prospects"
          emptyLabel={tTable('empty')}
          columns={[
            { key: 'email', label: t('columns.email'), sortable: true },
            { key: 'name', label: t('columns.name'), sortable: true },
            { key: 'company', label: t('columns.company'), sortable: true, secondary: true },
            { key: 'campaign', label: t('columns.campaign'), secondary: true },
            { key: 'status', label: t('columns.status'), sortable: true },
            { key: 'sentAt', label: t('columns.sentAt'), numeric: true, sortable: true },
            { key: 'reply', label: t('columns.reply'), sortable: true },
          ]}
          rows={prospectRows}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold">{t('replies.title')}</h2>
      <AdminTable
        exportName="lessio-outbound-replies"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'when', label: t('columns.when'), numeric: true, sortable: true },
          { key: 'from', label: t('columns.from'), sortable: true },
          { key: 'classification', label: t('columns.classification'), sortable: true },
          { key: 'snippet', label: t('columns.snippet') },
        ]}
        rows={replyRows}
      />
    </div>
  )
}
