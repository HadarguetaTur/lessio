import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { getLocale } from 'next-intl/server'

import { LandingPage } from '@/components/marketing/LandingPage'
import { getLandingContent, getLandingMetadata } from '@/lib/marketing/landingCopy'
import { getSiteContact } from '@/lib/marketing/siteContact'
import { getPublicPricingRows } from '@/lib/marketing/publicPricing'

/**
 * The locale comes from a cookie, so this page renders per request anyway;
 * what it must NOT do is hit the database per request. Prices change by
 * migration, not at runtime, so an hour-old catalog is always correct.
 */
const getCachedPricingRows = unstable_cache(getPublicPricingRows, ['public-pricing-rows'], {
  revalidate: 3600,
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return getLandingMetadata(locale)
}

export default async function RootPage() {
  // A signed-in visitor never reaches this render: src/proxy.ts sends them to
  // /dashboard before the page runs, so no auth round-trip is needed here.
  const locale = await getLocale()
  const content = getLandingContent(locale)
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const siteContact = getSiteContact()
  // Prices come from saas_plans, not from the copy file, so the landing page
  // and checkout can never quote different numbers.
  const pricingRows = await getCachedPricingRows()

  return (
    <LandingPage
      content={content}
      dir={dir}
      locale={locale}
      pricingRows={pricingRows}
      siteContact={siteContact}
    />
  )
}
