import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { listLeadsWithContext } from '@/lib/outbound/leads'
import { countByStatus, leadAttention, rankLeads } from '@/lib/outbound/leadInbox'
import { getLeadCardData } from '@/lib/outbound/leadCard'
import { OUTBOUND_TIMEZONE } from '@/lib/outbound/mailboxes'
import { PLATFORM_LEAD_STATUSES } from '@/lib/outbound/types'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import { LeadCard } from '@/components/admin/lead-card/LeadCard'
import { LeadCardSheet } from '@/components/admin/lead-card/LeadCardSheet'
import { cn } from '@/lib/utils'
import {
  createLeadFromProspectAction,
  saveLeadNotesAction,
  setLeadStatusAction,
  setNextActionAction,
} from './actions'
import {
  approveOpenerAction,
  markReplyReviewedAction,
  regenerateOpenerAction,
  suppressProspectAction,
} from '../outbound/actions'

/**
 * /admin/leads — the inbox of people worth a conversation.
 *
 * Ordered by what it costs to ignore a row today, not by date: a reminder
 * that came due, then someone new, then someone who wrote back and is
 * waiting. A row opens the lead card beside the list (`?open=<leadId>`),
 * which is where status, notes, the reminder and the whole thread live.
 */

const FILTERS = ['all', 'attention', ...PLATFORM_LEAD_STATUSES] as const
type Filter = (typeof FILTERS)[number]

function leadsHref(status: Filter, open?: string): string {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (open) params.set('open', open)
  const q = params.toString()
  return q ? `/admin/leads?${q}` : '/admin/leads'
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; open?: string }>
}) {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.leads')
  const tOut = await getTranslations('admin.outbound')
  const locale = await getLocale()
  const { status: statusParam, open } = await searchParams
  const filter: Filter = (FILTERS as readonly string[]).includes(statusParam ?? '') ? (statusParam as Filter) : 'all'

  const now = new Date()
  const nowDt = DateTime.fromJSDate(now)

  const [leads, card] = await Promise.all([
    listLeadsWithContext(500),
    open ? getLeadCardData({ leadId: open }) : Promise.resolve(null),
  ])

  const counts = countByStatus(leads, nowDt)
  const ranked = rankLeads(leads, nowDt).filter((lead) => {
    if (filter === 'all') return true
    if (filter === 'attention') return leadAttention(lead, nowDt) !== 'none'
    return lead.status === filter
  })

  const relative = (iso: string) => DateTime.fromISO(iso).setLocale(locale).toRelative({ base: nowDt }) ?? ''
  const short = (iso: string) => DateTime.fromISO(iso).setZone(OUTBOUND_TIMEZONE).setLocale(locale).toFormat('dd.MM HH:mm')

  const rows: AdminTableRow[] = ranked.map((lead) => {
    const attention = leadAttention(lead, nowDt)
    const due = attention === 'next_action_due'
    return {
      id: lead.id,
      href: leadsHref(filter, lead.id),
      cells: {
        who: (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{lead.name ?? lead.email ?? '—'}</span>
              {attention !== 'none' && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    due ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  )}
                >
                  {t(`attention.${attention}`)}
                </span>
              )}
            </div>
            {lead.company && <div className="truncate text-xs text-muted-foreground">{lead.company}</div>}
          </div>
        ),
        lastMessage: lead.lastInbound ? (
          <div className="min-w-0">
            <div className="line-clamp-1 text-xs" title={lead.lastInbound.body ?? ''}>
              {lead.lastInbound.body ?? '—'}
            </div>
            <div className="text-[11px] text-muted-foreground">{relative(lead.lastInbound.created_at)}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
        status: <ProspectStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />,
        prospectStatus: lead.prospect ? (
          <ProspectStatusBadge status={lead.prospect.status} label={tOut(`status.${lead.prospect.status}`)} />
        ) : (
          '—'
        ),
        nextAction: lead.next_action_at ? (
          <span className={cn('text-xs tabular-nums', due && 'font-semibold text-destructive')}>
            {short(lead.next_action_at)}
            {lead.next_action_note && (
              <span className="block truncate text-[11px] font-normal text-muted-foreground">{lead.next_action_note}</span>
            )}
          </span>
        ) : (
          '—'
        ),
        createdAt: short(lead.created_at),
      },
      sortValues: {
        who: lead.name ?? lead.email,
        lastMessage: lead.lastInbound?.created_at ?? null,
        status: lead.status,
        nextAction: lead.next_action_at,
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
        next_action_at: lead.next_action_at,
        created_at: lead.created_at,
        notes: lead.notes,
      },
    }
  })

  const cardTitle = card?.lead?.name ?? card?.lead?.email ?? t('card.title')

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <nav className="mb-4 flex flex-wrap gap-1 text-xs" aria-label={t('filters.all')}>
        {FILTERS.map((f) => {
          const count = counts[f as keyof typeof counts] ?? 0
          const active = f === filter
          const label = f === 'all' ? t('filters.all') : f === 'attention' ? t('filters.attention') : t(`status.${f}`)
          return (
            <Link
              key={f}
              href={leadsHref(f)}
              className={cn(
                'rounded-full px-2.5 py-1 tabular-nums',
                active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                f === 'attention' && !active && count > 0 && 'text-amber-700 dark:text-amber-400'
              )}
            >
              {label} · {count}
            </Link>
          )
        })}
      </nav>

      <AdminTable
        exportName="lessio-leads"
        emptyLabel={t('empty')}
        highlightId={open}
        columns={[
          { key: 'who', label: t('columns.name'), sortable: true },
          { key: 'lastMessage', label: t('columns.lastMessage'), sortable: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'prospectStatus', label: t('columns.prospectStatus'), secondary: true },
          { key: 'nextAction', label: t('columns.nextAction'), sortable: true },
          { key: 'createdAt', label: t('columns.createdAt'), numeric: true, sortable: true, secondary: true },
        ]}
        rows={rows}
      />

      <LeadCardSheet
        open={Boolean(card)}
        side={locale === 'he' ? 'left' : 'right'}
        title={cardTitle}
        description={t('card.description')}
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
