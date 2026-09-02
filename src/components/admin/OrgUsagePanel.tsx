import { getTranslations } from 'next-intl/server'

import { cn } from '@/lib/utils'
import type { OrgQuotaUsage } from '@/lib/saas/quota'

/**
 * Where the tenant sits against its plan's ceilings, and where its first-touch
 * attribution came from.
 *
 * Per /docs/sprint-34-scope.md § /admin/orgs/[id] — the "שימוש ומכסות" tab.
 * getOrgQuotaUsage() has existed since Sprint 27 and was never called from the
 * admin panel, so "which tenant is about to outgrow its plan" — the strongest
 * upgrade signal there is — was invisible to the person who could act on it.
 */

function Meter({
  label,
  used,
  limit,
  unlimitedLabel,
}: {
  label: string
  used: number
  limit: number | null
  unlimitedLabel: string
}) {
  const ratio = limit != null && limit > 0 ? used / limit : null
  const pct = ratio != null ? Math.min(ratio * 100, 100) : 0

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            'text-sm tabular-nums',
            ratio == null && 'text-muted-foreground',
            ratio != null && ratio >= 1 && 'font-semibold text-destructive',
            ratio != null && ratio >= 0.8 && ratio < 1 && 'font-semibold text-amber-600'
          )}
        >
          {used}
          <span className="opacity-60">
            {limit != null ? ` / ${limit}` : ` / ${unlimitedLabel}`}
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            ratio == null && 'bg-muted-foreground/30',
            ratio != null && ratio >= 1 && 'bg-destructive',
            ratio != null && ratio >= 0.8 && ratio < 1 && 'bg-amber-500',
            ratio != null && ratio < 0.8 && 'bg-emerald-500'
          )}
          // An unlimited plan shows a flat rail rather than a bar that would
          // imply a ceiling it does not have.
          style={{ width: ratio == null ? '100%' : `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  )
}

export async function OrgUsagePanel({
  quota,
  attribution,
}: {
  // Derived from getOrgQuotaUsage rather than restated, so a new quota
  // dimension shows up here as a compile error instead of a missing meter.
  quota: OrgQuotaUsage
  attribution: Record<string, unknown> | null
}) {
  const t = await getTranslations('admin.orgs.usage')
  const tPlans = await getTranslations('admin.plans')

  const firstTouch =
    attribution && typeof attribution.first === 'object' && attribution.first
      ? (attribution.first as Record<string, unknown>)
      : null

  const attributionRows: [string, unknown][] = firstTouch
    ? (['source', 'medium', 'campaign', 'content', 'referrer', 'landingPath'] as const)
        .map((k) => [k, firstTouch[k]] as [string, unknown])
        .filter(([, v]) => typeof v === 'string' && v.length > 0)
    : []

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background p-5">
        <h2 className="mb-4 text-sm font-semibold">{t('title')}</h2>
        <div className="space-y-4">
          <Meter
            label={tPlans('studentsQuota')}
            used={quota.studentsUsed}
            limit={quota.studentsLimit}
            unlimitedLabel={tPlans('unlimited')}
          />
          <Meter
            label={tPlans('lessonsQuota')}
            used={quota.lessonsUsed}
            limit={quota.lessonsLimit}
            unlimitedLabel={tPlans('unlimited')}
          />
          <Meter
            label={tPlans('teachersQuota')}
            used={quota.teachersUsed}
            limit={quota.teachersLimit}
            unlimitedLabel={tPlans('unlimited')}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold">{t('attribution')}</h2>
        {attributionRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noAttribution')}</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {attributionRows.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{t(`field.${key}`)}</dt>
                <dd className="mt-0.5 truncate font-mono text-xs" dir="ltr" title={String(value)}>
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  )
}
