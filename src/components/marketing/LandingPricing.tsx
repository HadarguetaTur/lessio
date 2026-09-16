import Link from 'next/link'

import { cn } from '@/lib/utils'
import { CenterPlanInquiryDialog } from '@/components/marketing/CenterPlanInquiryDialog'
import { PenUnderline } from '@/components/marketing/LandingPenMarks'
import type { PublicPricingRow } from '@/lib/marketing/publicPricing'
import type { LandingContent } from '@/lib/marketing/landingCopy'

/**
 * The plans page of the diary: a ruled table, three columns, hairlines only.
 * Copy comes from landingCopy; the numbers come from saas_plans at render
 * time, so this page and checkout can never disagree.
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
      <header className="text-center sm:text-start" data-pen>
        <h2 className="display mx-auto max-w-[22ch] text-[2rem] sm:mx-0 sm:text-[2.5rem]">
          <span className="title-pen">
            {copy.title}
            <PenUnderline />
          </span>
        </h2>
        <p className="mx-auto mt-3 max-w-[60ch] text-[color:var(--ink-2)] sm:mx-0">{copy.intro}</p>
      </header>

      <div className="rule-t mt-14 grid sm:grid-cols-3">
        {rows.map((row, i) => {
          // Studio is the tier most centres land on, so it carries the pen note.
          const featured = row.name === 'studio'
          return (
            <div
              key={row.name}
              className={cn(
                'rule-b relative flex flex-col items-center gap-1 py-7 text-center sm:items-start sm:pe-6 sm:text-start',
                i > 0 && 'sm:rule-s sm:ps-6',
                featured && 'pt-11 sm:pt-7'
              )}
            >
              {featured ? (
                <p className="pen pen-red absolute -top-7 inset-x-0 -rotate-2 text-center text-[1.5rem] sm:inset-x-auto sm:start-6 sm:text-start">{copy.featuredLabel}</p>
              ) : null}
              <h3 className="display text-[1.75rem]">{isHe ? row.labelHe : row.labelEn}</h3>
              <p className="text-[color:var(--ink-2)]">{seats(row.teachersQuota)}</p>

              {row.isCustom ? (
                <p className="display mt-5 text-[1.75rem]">{copy.customPricing}</p>
              ) : (
                <p className="tabular mt-5 text-center sm:text-start" dir="ltr" style={{ textAlign: undefined }}>
                  <span className="display text-[2.75rem] leading-none">{money(row.priceMonthly)}</span>
                  <span className="ms-1.5 text-sm text-[color:var(--ink-2)]">{copy.perMonth}</span>
                </p>
              )}
              {!row.isCustom && row.priceYearly != null ? (
                <p className="tabular text-sm text-[color:var(--ink-2)]">
                  <span dir="ltr">{money(row.priceYearly)}</span> {copy.perYear}
                </p>
              ) : null}

              <p className="mt-3 text-sm text-[color:var(--ink-2)]">{copy.featureLine}</p>

              <div className="mt-6">
                {row.isCustom ? (
                  <CenterPlanInquiryDialog
                    copy={copy.centerInquiry}
                    locale={locale}
                    className="h-auto min-h-11 w-auto rounded-none border-0 bg-transparent p-0 text-[1.0625rem] font-semibold text-[color:var(--ink)] underline decoration-[color:var(--rule)] decoration-2 underline-offset-[6px] shadow-none hover:bg-transparent hover:decoration-[color:var(--ink)]"
                  />
                ) : featured ? (
                  <Link href={signupHref} data-cta={`pricing-${row.name}`} className="hl-cta">
                    {copy.cta}
                  </Link>
                ) : (
                  <Link
                    href={signupHref}
                    data-cta={`pricing-${row.name}`}
                    className="inline-flex min-h-11 items-center font-semibold text-[color:var(--ink)] underline decoration-[color:var(--rule)] decoration-2 underline-offset-[6px] hover:decoration-[color:var(--ink)]"
                  >
                    {copy.cta}
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-center text-sm text-[color:var(--ink-2)] sm:text-start">
        {copy.trialNote} {copy.trialIncludes} {copy.yearlyNote} {copy.vatNote}
      </p>
    </div>
  )
}
