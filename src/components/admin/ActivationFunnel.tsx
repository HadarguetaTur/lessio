import { getTranslations } from 'next-intl/server'

import type { FunnelStage } from '@/lib/superadmin/metrics'

/**
 * Where orgs that signed up in the last 30 days stopped.
 *
 * Per /docs/sprint-34-scope.md § /admin block 2. Bars are sized against the
 * first stage, so the drop between two neighbours is the visible quantity —
 * that gap is the whole point of the panel.
 */
export async function ActivationFunnel({ stages }: { stages: FunnelStage[] }) {
  const t = await getTranslations('admin.overview.funnel')

  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('subtitle')}</p>

      <ol className="space-y-2.5">
        {stages.map((stage, i) => {
          const prev = i > 0 ? stages[i - 1] : null
          // Step-over rate against the previous stage, not against the cohort:
          // "60% of the ones who got here went on" is the actionable number.
          const stepRate =
            prev && prev.count > 0 ? stage.count / prev.count : null

          return (
            <li key={stage.key}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium">{t(stage.key)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {stage.count}
                  {stepRate != null && (
                    <span className="ms-2 opacity-70">
                      {(stepRate * 100).toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${t(stage.key)}: ${stage.count}`}
              >
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width]"
                  style={{ width: `${Math.max(stage.rate * 100, stage.count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
