import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { PublicPricingRow } from '@/lib/marketing/publicPricing'
import type { LandingContent } from '@/lib/marketing/landingCopy'

/**
 * The pricing section. The landing page had no prices at all — a visitor could
 * not find out what Lessio costs without signing up, which loses exactly the
 * qualified buyer the "not built for every teacher" positioning is aimed at.
 *
 * Copy comes from landingCopy; the numbers come from saas_plans at render time,
 * so this section and checkout can never disagree.
 */
export function LandingPricing({
  copy,
  rows,
  locale,
  signupHref,
}: {
  copy: LandingContent['pricing']
  rows: PublicPricingRow[]
  locale: string
  signupHref: string
}) {
  const isHe = locale === 'he'
  const money = (n: number) =>
    new Intl.NumberFormat(isHe ? 'he-IL' : 'en-US', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(n)

  const seats = (quota: number | null) => {
    if (quota == null) return copy.teachersUnlimited
    if (quota === 1) return copy.teachersOne
    return copy.teachersUpTo.replace('{count}', String(quota))
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl md:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {copy.intro}
        </p>
      </div>

      <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          // Studio is the tier most businesses land on, so it carries the
          // emphasis rather than the most expensive one.
          const featured = row.name === 'studio'
          return (
            <div
              key={row.name}
              className={cn(
                'relative flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/85 px-6 py-7 shadow-sm backdrop-blur-sm',
                featured && 'border-2 border-violet-500/45 shadow-lg ring-2 ring-violet-500/10'
              )}
            >
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {isHe ? row.labelHe : row.labelEn}
              </h3>

              <p className="text-sm font-medium text-muted-foreground">{seats(row.teachersQuota)}</p>

              <div className="tabular-nums" dir="ltr">
                <span className="text-3xl font-bold leading-none tracking-tight text-foreground">
                  {money(row.priceMonthly)}
                </span>
                <span className="ms-1.5 text-sm font-medium text-muted-foreground">
                  {copy.perMonth}
                </span>
              </div>

              {row.priceYearly != null ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  <span dir="ltr">{money(row.priceYearly)}</span> {copy.perYear}
                </p>
              ) : null}

              <Link
                href={signupHref}
                className={cn(
                  'mt-auto inline-flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors',
                  featured
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'border border-border/70 text-foreground hover:bg-muted/60'
                )}
              >
                {copy.cta}
              </Link>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        {copy.trialNote} · {copy.yearlyNote} · {copy.vatNote}
      </p>
    </div>
  )
}
