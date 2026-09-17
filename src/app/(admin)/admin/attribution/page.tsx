import Link from 'next/link'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { listMarketingLinks } from '@/lib/landing-analytics/links'
import {
  REPORT_ROW_CAP,
  aggregatePageviews,
  fetchPageviews,
  type SourceStats,
} from '@/lib/landing-analytics/report'
import {
  KNOWN_CTAS,
  LANDING_PATHS,
  LANDING_SECTIONS,
  NOTRACK_COOKIE,
} from '@/lib/landing-analytics/sections'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { SectionFunnel } from '@/components/admin/SectionFunnel'
import {
  ArchiveLinkButton,
  CopyLinkButton,
  MarketingLinkBuilder,
  NoTrackToggle,
} from '@/components/admin/MarketingLinkBuilder'
import {
  archiveMarketingLinkAction,
  createMarketingLinkAction,
  setNoTrackAction,
} from './actions'
import { cn } from '@/lib/utils'

/**
 * Which post brought visitors to the landing page, and what they did there.
 *
 * Reads the first-party measurement in landing_pageviews (see the decision in
 * /docs/decisions.md): it counts every visitor, not only those who accepted the
 * consent banner, which is the only way a few hundred organic visits from
 * group posts produce numbers worth acting on.
 */

const RANGES = [7, 14, 30, 90] as const
const DEFAULT_RANGE = 14

/** The campaign new links default to — docs/campaign-close-september.md. */
const DEFAULT_CAMPAIGN = 'close-september'

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export default async function AdminAttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; path?: string }>
}) {
  await requirePlatformSession('growth.read')

  const t = await getTranslations('admin.attribution')
  const tTable = await getTranslations('admin.table')
  const params = await searchParams

  const days = RANGES.find((d) => String(d) === params.days) ?? DEFAULT_RANGE
  const path = LANDING_PATHS.find((p) => p === params.path)

  const now = DateTime.utc()
  const [{ rows: pageviews, truncated }, links, cookieStore] = await Promise.all([
    fetchPageviews({
      fromIso: now.minus({ days }).toISO()!,
      toIso: now.plus({ minutes: 1 }).toISO()!,
      path,
    }),
    listMarketingLinks(),
    cookies(),
  ])

  const report = aggregatePageviews(pageviews)
  const { totals } = report
  const linkBySlug = new Map(links.map((l) => [l.slug, l]))
  const statsBySlug = new Map(
    report.sources.filter((s) => s.slug).map((s) => [s.slug as string, s])
  )

  const sourceName = (s: SourceStats): string => {
    if (s.kind === 'direct') return t('sources.direct')
    if (s.kind === 'link') return linkBySlug.get(s.name)?.label ?? s.name
    return s.name
  }

  const sourceRows: AdminTableRow[] = report.sources.map((s) => ({
    id: s.key,
    cells: {
      source: (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{sourceName(s)}</span>
          <span className="truncate text-xs text-muted-foreground" dir="ltr">
            {s.kind === 'link' ? `/go/${s.name}` : t(`sources.kind.${s.kind}`)}
          </span>
        </span>
      ),
      clicks: s.slug ? (linkBySlug.get(s.slug)?.clickCount ?? '—') : '—',
      visits: s.visits,
      uniques: s.uniqueVisitors,
      chain: pct(s.reached.chain, s.visits),
      pricing: pct(s.reached.pricing, s.visits),
      final: pct(s.reached.final, s.visits),
      engaged: formatDuration(s.medianEngagedMs),
      ctaRate: pct(s.visitsWithCta, s.visits),
      topCta: s.topCta ? <span className="font-mono text-xs">{s.topCta}</span> : '—',
      signups: s.signups,
      leads: s.leads,
    },
    sortValues: {
      source: sourceName(s),
      visits: s.visits,
      uniques: s.uniqueVisitors,
      chain: s.visits ? s.reached.chain / s.visits : 0,
      pricing: s.visits ? s.reached.pricing / s.visits : 0,
      final: s.visits ? s.reached.final / s.visits : 0,
      engaged: s.medianEngagedMs,
      ctaRate: s.visits ? s.visitsWithCta / s.visits : 0,
      signups: s.signups,
      leads: s.leads,
    },
    csv: {
      source: sourceName(s),
      kind: s.kind,
      key: s.name,
      visits: s.visits,
      uniques: s.uniqueVisitors,
      ...Object.fromEntries(LANDING_SECTIONS.map((sec) => [`reached_${sec}`, s.reached[sec]])),
      medianEngagedSeconds: Math.round(s.medianEngagedMs / 1000),
      medianScrollPct: s.medianScrollPct,
      visitsWithCta: s.visitsWithCta,
      topCta: s.topCta ?? '',
      signups: s.signups,
      leads: s.leads,
    },
  }))

  const ctaRows: AdminTableRow[] = KNOWN_CTAS.filter((cta) => totals.ctaCounts[cta]).map((cta) => ({
    id: cta,
    cells: {
      cta: (
        <span className="flex flex-col">
          <span className="font-medium">{t(`ctas.${cta}`)}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{cta}</span>
        </span>
      ),
      clicks: totals.ctaCounts[cta],
      share: pct(totals.ctaCounts[cta], totals.visits),
    },
    sortValues: { cta, clicks: totals.ctaCounts[cta] },
    csv: { cta, clicks: totals.ctaCounts[cta] },
  }))

  const linkRows: AdminTableRow[] = links.map((link) => ({
    id: link.id,
    cells: {
      label: (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{link.label}</span>
          {link.note && <span className="truncate text-xs text-muted-foreground">{link.note}</span>}
        </span>
      ),
      url: (
        <span className="flex items-center gap-1">
          <span className="truncate font-mono text-xs" dir="ltr">{link.shortUrl.replace(/^https?:\/\//, '')}</span>
          <CopyLinkButton value={link.shortUrl} label={t('links.copyShort')} />
        </span>
      ),
      target: <span className="font-mono text-xs" dir="ltr">{link.targetPath}</span>,
      clicks: link.clickCount,
      visits: statsBySlug.get(link.slug)?.visits ?? 0,
      actions: (
        <span className="flex items-center justify-end gap-1">
          <CopyLinkButton value={link.fullUrl} label={t('links.copyFull')} />
          <ArchiveLinkButton id={link.id} action={archiveMarketingLinkAction} label={t('links.archive')} />
        </span>
      ),
    },
    sortValues: {
      label: link.label,
      clicks: link.clickCount,
      visits: statsBySlug.get(link.slug)?.visits ?? 0,
    },
    csv: {
      label: link.label,
      note: link.note ?? '',
      shortUrl: link.shortUrl,
      fullUrl: link.fullUrl,
      clicks: link.clickCount,
    },
  }))

  const query = (next: { days?: number; path?: string | null }) => {
    const q = new URLSearchParams()
    const d = next.days ?? days
    const p = next.path === undefined ? path : next.path
    if (d !== DEFAULT_RANGE) q.set('days', String(d))
    if (p) q.set('path', p)
    const s = q.toString()
    return s ? `/admin/attribution?${s}` : '/admin/attribution'
  }

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-medium tabular-nums',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-background text-muted-foreground hover:text-foreground'
    )

  const cards = [
    { label: t('cards.visits'), value: totals.visits, sub: t('cards.uniques', { count: totals.uniqueVisitors }) },
    {
      label: t('cards.engaged'),
      value: formatDuration(totals.medianEngagedMs),
      sub: t('cards.scroll', { pct: totals.medianScrollPct }),
    },
    {
      label: t('cards.ctaRate'),
      value: pct(totals.visitsWithCta, totals.visits),
      sub: t('cards.ctaVisits', { count: totals.visitsWithCta }),
    },
    {
      label: t('cards.signups'),
      value: totals.signups,
      sub: t('cards.leads', { count: totals.leads }),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('title')} subtitle={t('description')} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {RANGES.map((d) => (
          <Link key={d} href={query({ days: d })} className={chip(d === days)}>
            {t('range', { days: d })}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Link href={query({ path: null })} className={chip(!path)}>
          {t('pages.all')}
        </Link>
        {LANDING_PATHS.map((p) => (
          <Link key={p} href={query({ path: p })} className={chip(p === path)}>
            <span dir="ltr">{p}</span>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-background p-5">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{card.sub}</p>
          </div>
        ))}
      </div>

      {truncated && (
        <p className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t('truncated', { cap: REPORT_ROW_CAP })}
        </p>
      )}

      <h2 className="mb-1 text-sm font-semibold">{t('bySource')}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t('bySourceHint')}</p>
      <div className="mb-8">
        <AdminTable
          exportName="lessio-landing-sources"
          emptyLabel={t('empty')}
          columns={[
            { key: 'source', label: t('columns.source'), sortable: true },
            { key: 'clicks', label: t('columns.clicks'), numeric: true, secondary: true },
            { key: 'visits', label: t('columns.visits'), numeric: true, sortable: true },
            { key: 'uniques', label: t('columns.uniques'), numeric: true, sortable: true, secondary: true },
            { key: 'chain', label: t('columns.chain'), numeric: true, sortable: true },
            { key: 'pricing', label: t('columns.pricing'), numeric: true, sortable: true },
            { key: 'final', label: t('columns.final'), numeric: true, sortable: true, secondary: true },
            { key: 'engaged', label: t('columns.engaged'), numeric: true, sortable: true },
            { key: 'ctaRate', label: t('columns.ctaRate'), numeric: true, sortable: true },
            { key: 'topCta', label: t('columns.topCta'), secondary: true },
            { key: 'signups', label: t('columns.signups'), numeric: true, sortable: true },
            { key: 'leads', label: t('columns.leads'), numeric: true, sortable: true, secondary: true },
          ]}
          rows={sourceRows}
        />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h2 className="mb-1 text-sm font-semibold">{t('funnel.title')}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t('funnel.hint')}</p>
          <SectionFunnel
            total={totals.visits}
            emptyLabel={t('empty')}
            steps={LANDING_SECTIONS.map((section) => ({
              id: section,
              label: t(`sections.${section}`),
              count: totals.reached[section],
            }))}
          />
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold">{t('ctaTable.title')}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t('ctaTable.hint')}</p>
          <AdminTable
            emptyLabel={tTable('empty')}
            columns={[
              { key: 'cta', label: t('ctaTable.cta'), sortable: true },
              { key: 'clicks', label: t('ctaTable.clicks'), numeric: true, sortable: true },
              { key: 'share', label: t('ctaTable.share'), numeric: true },
            ]}
            rows={ctaRows}
          />
        </div>
      </div>

      <div className="mb-6">
        <MarketingLinkBuilder
          createAction={createMarketingLinkAction}
          targetPaths={LANDING_PATHS}
          defaultCampaign={DEFAULT_CAMPAIGN}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold">{t('links.title')}</h2>
      <div className="mb-8">
        <AdminTable
          exportName="lessio-marketing-links"
          emptyLabel={t('links.empty')}
          columns={[
            { key: 'label', label: t('links.label'), sortable: true },
            { key: 'url', label: t('links.url') },
            { key: 'target', label: t('links.target'), secondary: true },
            { key: 'clicks', label: t('links.clicks'), numeric: true, sortable: true },
            { key: 'visits', label: t('links.visits'), numeric: true, sortable: true },
            { key: 'actions', label: '', align: 'end' },
          ]}
          rows={linkRows}
        />
      </div>

      <NoTrackToggle enabled={cookieStore.has(NOTRACK_COOKIE)} action={setNoTrackAction} />
    </div>
  )
}
