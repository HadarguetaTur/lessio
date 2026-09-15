import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listCampaigns } from '@/lib/outbound/campaigns'
import { getOutboundCockpit } from '@/lib/outbound/stats'
import { listOpenersToReview } from '@/lib/outbound/opener'
import { listMailboxesWithUsage, OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import { listInboundReplies } from '@/lib/outbound/messages'
import { listSuppressions } from '@/lib/outbound/suppressions'
import { getLeadCardData } from '@/lib/outbound/leadCard'
import { isServiceAccountConfigured } from '@/lib/gmail/serviceAccount'
import { PROSPECT_STATUSES, type Prospect, type ProspectStatus } from '@/lib/outbound/types'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTabs } from '@/components/admin/AdminTabs'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { MarkReviewedButton } from '@/components/admin/MarkReviewedButton'
import { OutboundCampaignForm } from '@/components/admin/OutboundCampaignForm'
import { OutboundCockpit } from '@/components/admin/OutboundCockpit'
import { OutboundImportForm } from '@/components/admin/OutboundImportForm'
import { OutboundMailboxesCard } from '@/components/admin/OutboundMailboxesCard'
import { OutboundOpenerReview } from '@/components/admin/OutboundOpenerReview'
import { OutboundSuppressionForm } from '@/components/admin/OutboundSuppressionForm'
import { OutboundCandidateReview } from '@/components/admin/OutboundCandidateReview'
import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import { LeadCard } from '@/components/admin/lead-card/LeadCard'
import { LeadCardSheet } from '@/components/admin/lead-card/LeadCardSheet'
import { cn } from '@/lib/utils'
import {
  addSuppressionAction,
  approveOpenerAction,
  importProspectsAction,
  markReplyReviewedAction,
  regenerateOpenerAction,
  saveCampaignAction,
  saveMailboxAction,
  sendMailboxTestAction,
  suppressProspectAction,
  approveDiscoveryCandidatesAction,
  runDiscoveryAction,
} from './actions'
import { listDiscoveryCandidates } from '@/lib/outbound/discovery'
import {
  createLeadFromProspectAction,
  saveLeadNotesAction,
  setLeadStatusAction,
  setNextActionAction,
} from '../leads/actions'

/**
 * /admin/outbound — the cold-email engine, one tab per job.
 *
 * The landing tab answers "what is waiting for me and is the machine
 * running"; the queue, the opening lines and the replies each get a tab;
 * everything that is configuration rather than work lives under settings.
 * A row anywhere opens the lead card beside the table (`?open=<prospectId>`).
 */

const TABS = ['attention', 'candidates', 'queue', 'openers', 'replies', 'settings'] as const
type Tab = (typeof TABS)[number]
const STATUS_FILTERS = ['all', ...PROSPECT_STATUSES] as const

type ProspectListRow = Pick<
  Prospect,
  'id' | 'email' | 'first_name' | 'last_name' | 'company' | 'status' | 'sent_at' | 'replied_at' | 'last_reply_class' | 'created_at' | 'campaign_id' | 'opener_status' | 'next_followup_at'
>

/** The one place a link into this page is built, so tab/status/open never drift apart. */
function outboundHref(p: { tab?: Tab; status?: string | null; open?: string | null }): string {
  const params = new URLSearchParams()
  if (p.tab && p.tab !== 'attention') params.set('tab', p.tab)
  if (p.status) params.set('status', p.status)
  if (p.open) params.set('open', p.open)
  const q = params.toString()
  return q ? `/admin/outbound?${q}` : '/admin/outbound'
}

export default async function AdminOutboundPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; open?: string }>
}) {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.outbound')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()
  const { tab: tabParam, status: statusParam, open } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'attention'
  const statusFilter = (PROSPECT_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? (statusParam as ProspectStatus)
    : null

  const now = new Date()
  const db = createServiceRoleClient()
  const fmt = (iso: string | null) =>
    iso ? DateTime.fromISO(iso).setZone(OUTBOUND_TIMEZONE).setLocale(locale).toFormat('dd.MM HH:mm') : '—'

  // Always: the counts (cheap head counts) and the campaign names.
  const [mailboxes, campaigns] = await Promise.all([listMailboxesWithUsage(now), listCampaigns()])
  const cockpit = await getOutboundCockpit(mailboxes, now)
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]))

  // Only what the active tab shows.
  let prospectsQuery = db
    .from('outbound_prospects')
    .select('id, email, first_name, last_name, company, status, sent_at, replied_at, last_reply_class, created_at, campaign_id, opener_status, next_followup_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (statusFilter) prospectsQuery = prospectsQuery.eq('status', statusFilter)

  const [prospectsRes, openers, replies, suppressions, card, candidates] = await Promise.all([
    tab === 'queue' ? prospectsQuery : Promise.resolve({ data: [] as ProspectListRow[] }),
    tab === 'openers' ? listOpenersToReview() : Promise.resolve([]),
    tab === 'replies' ? listInboundReplies(100) : Promise.resolve([]),
    tab === 'settings' ? listSuppressions(50) : Promise.resolve([]),
    open ? getLeadCardData({ prospectId: open }) : Promise.resolve(null),
    tab === 'candidates' ? listDiscoveryCandidates() : Promise.resolve([]),
  ])
  const prospects = (prospectsRes.data ?? []) as ProspectListRow[]

  const tabs = [
    { key: 'attention', label: t('tabs.attention'), count: cockpit.openersToReview + cockpit.repliesToReview + cockpit.newLeads + cockpit.dueNextActions + cockpit.mailboxErrors.length },
    { key: 'candidates', label: 'מועמדים' },
    { key: 'queue', label: t('tabs.queue'), count: cockpit.queued },
    { key: 'openers', label: t('tabs.openers'), count: cockpit.openersToReview },
    { key: 'replies', label: t('tabs.replies'), count: cockpit.repliesToReview },
    { key: 'settings', label: t('tabs.settings') },
  ]

  const prospectRows: AdminTableRow[] = prospects.map((p) => ({
    id: p.id,
    href: outboundHref({ tab: 'queue', status: statusFilter, open: p.id }),
    cells: {
      who: (
        <div className="min-w-0">
          <div className="truncate font-medium">{[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
            {p.email}
          </div>
        </div>
      ),
      company: p.company ?? '—',
      campaign: campaignName.get(p.campaign_id) ?? '—',
      status: (
        <div className="flex flex-wrap gap-1">
          <ProspectStatusBadge status={p.status} label={t(`status.${p.status}`)} />
          {p.status === 'queued' && p.opener_status !== 'none' && p.opener_status !== 'approved' && (
            <ProspectStatusBadge status="pending" label={t(`opener.status.${p.opener_status}`)} />
          )}
        </div>
      ),
      sentAt: fmt(p.sent_at),
      reply: p.last_reply_class ? (
        <ProspectStatusBadge status={p.last_reply_class} label={t(`classification.${p.last_reply_class}`)} />
      ) : (
        '—'
      ),
    },
    sortValues: {
      who: p.first_name ?? p.email,
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
      opener_status: p.opener_status,
      sent_at: p.sent_at,
      replied_at: p.replied_at,
      last_reply_class: p.last_reply_class,
      next_followup_at: p.next_followup_at,
    },
  }))

  const replyRows: AdminTableRow[] = replies.map((m) => {
    const needsLook = !m.reviewed_at && (m.classification === 'unknown' || m.classification === 'unmatched')
    return {
      id: m.id,
      href: m.prospect_id ? outboundHref({ tab: 'replies', open: m.prospect_id }) : undefined,
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
        handled: needsLook ? (
          <MarkReviewedButton messageId={m.id} label={t('replies.markReviewed')} action={markReplyReviewedAction} />
        ) : m.reviewed_at ? (
          <span className="text-xs text-muted-foreground">{t('replies.reviewed')}</span>
        ) : (
          ''
        ),
      },
      sortValues: { when: m.created_at, from: m.from_email, classification: m.classification },
      csv: { when: m.created_at, from: m.from_email, subject: m.subject, classification: m.classification, snippet: m.body },
    }
  })

  const cardTitle =
    card?.lead?.name ??
    [card?.prospect?.first_name, card?.prospect?.last_name].filter(Boolean).join(' ') ??
    t('title')

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <AdminTabs basePath="/admin/outbound" current={tab} tabs={tabs} />

      {tab === 'attention' && (
        <OutboundCockpit
          cockpit={cockpit}
          locale={locale}
          hrefs={{
            openers: outboundHref({ tab: 'openers' }),
            replies: outboundHref({ tab: 'replies' }),
            newLeads: '/admin/leads?status=new',
            dueActions: '/admin/leads?status=attention',
            settings: outboundHref({ tab: 'settings' }),
          }}
        />
      )}

      {tab === 'candidates' && (
        <OutboundCandidateReview
          candidates={candidates}
          discoverAction={runDiscoveryAction}
          approveAction={approveDiscoveryCandidatesAction}
        />
      )}

      {tab === 'queue' && (
        <>
          <nav className="mb-3 flex flex-wrap gap-1 text-xs" aria-label={t('prospects.filter')}>
            {STATUS_FILTERS.map((s) => {
              const active = s === 'all' ? !statusFilter : statusFilter === s
              return (
                <Link
                  key={s}
                  href={outboundHref({ tab: 'queue', status: s === 'all' ? null : s })}
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
          <AdminTable
            exportName="lessio-prospects"
            emptyLabel={tTable('empty')}
            highlightId={open}
            columns={[
              { key: 'who', label: t('columns.name'), sortable: true },
              { key: 'company', label: t('columns.company'), sortable: true, secondary: true },
              { key: 'campaign', label: t('columns.campaign'), secondary: true },
              { key: 'status', label: t('columns.status'), sortable: true },
              { key: 'sentAt', label: t('columns.sentAt'), numeric: true, sortable: true },
              { key: 'reply', label: t('columns.reply'), sortable: true },
            ]}
            rows={prospectRows}
          />
        </>
      )}

      {tab === 'openers' && (
        <OutboundOpenerReview rows={openers} approveAction={approveOpenerAction} regenerateAction={regenerateOpenerAction} />
      )}

      {tab === 'replies' && (
        <AdminTable
          exportName="lessio-outbound-replies"
          emptyLabel={tTable('empty')}
          highlightId={open}
          columns={[
            { key: 'when', label: t('columns.when'), numeric: true, sortable: true },
            { key: 'from', label: t('columns.from'), sortable: true },
            { key: 'classification', label: t('columns.classification'), sortable: true },
            { key: 'snippet', label: t('columns.snippet') },
            { key: 'handled', label: '', align: 'end' },
          ]}
          rows={replyRows}
        />
      )}

      {tab === 'settings' && (
        <div className="flex flex-col gap-8">
          <OutboundMailboxesCard
            mailboxes={mailboxes}
            serviceAccountConfigured={isServiceAccountConfigured()}
            formatDate={Object.fromEntries(mailboxes.map((m) => [m.id, fmt(m.last_polled_at)]))}
            saveAction={saveMailboxAction}
            testAction={sendMailboxTestAction}
          />
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <OutboundCampaignForm key={campaign.id} campaign={campaign} action={saveCampaignAction} />
            ))}
            <OutboundCampaignForm action={saveCampaignAction} />
          </div>
          <OutboundImportForm campaigns={campaigns} action={importProspectsAction} />
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-1 text-base font-semibold">{t('suppression.title')}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{t('suppression.description')}</p>
            <OutboundSuppressionForm action={addSuppressionAction} />
            {suppressions.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t('suppression.list')}</h3>
                <AdminTable
                  emptyLabel={tTable('empty')}
                  pageSize={10}
                  columns={[
                    { key: 'email', label: t('columns.email') },
                    { key: 'reason', label: t('columns.classification') },
                    { key: 'when', label: t('columns.when'), numeric: true },
                  ]}
                  rows={suppressions.map((s) => ({
                    id: s.id,
                    cells: {
                      email: (
                        <span className="font-mono text-xs" dir="ltr">
                          {s.email}
                        </span>
                      ),
                      reason: s.reason,
                      when: fmt(s.created_at),
                    },
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <LeadCardSheet
        open={Boolean(card)}
        side={locale === 'he' ? 'left' : 'right'}
        title={cardTitle}
        description={t('description')}
      >
        {card && (
          <LeadCard
            data={card}
            locale={locale}
            now={now}
            actions={{
              setStatus: setLeadStatusAction,
              saveNotes: saveLeadNotesAction,
              setNextAction: setNextActionAction,
              createLead: createLeadFromProspectAction,
              suppress: suppressProspectAction,
              markReviewed: markReplyReviewedAction,
              approveOpener: approveOpenerAction,
              regenerateOpener: regenerateOpenerAction,
            }}
          />
        )}
      </LeadCardSheet>
    </div>
  )
}
