import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { getLocale } from 'next-intl/server'

import { LandingPage } from '@/components/marketing/LandingPage'
import { getLandingMetadata } from '@/lib/marketing/landingCopy'
import { getPublicPricingRows } from '@/lib/marketing/publicPricing'
import { getSiteContact } from '@/lib/marketing/siteContact'
import { getTutorsContent } from '@/lib/marketing/tutorsCopy'

/**
 * The landing page as read by a tutor who works alone: same diary, same worked
 * example, Solo as the marked plan. Campaign traffic for solo tutors lands here
 * because the main page tells them, in so many words, that it is not for them.
 */
const getCachedPricingRows = unstable_cache(getPublicPricingRows, ['public-pricing-rows'], {
  revalidate: 3600,
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    ...getLandingMetadata(locale, getTutorsContent(locale)),
    alternates: { canonical: '/tutors' },
  }
}

export default async function TutorsPage() {
  const locale = await getLocale()
  const pricingRows = await getCachedPricingRows()

  return (
    <LandingPage
      content={getTutorsContent(locale)}
      dir={locale === 'he' ? 'rtl' : 'ltr'}
      locale={locale}
      pricingRows={pricingRows}
      siteContact={getSiteContact()}
      featuredPlan="solo"
    />
  )
}
