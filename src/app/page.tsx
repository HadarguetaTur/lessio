import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'

import { LandingPage } from '@/components/marketing/LandingPage'
import { createClient } from '@/lib/supabase/server'
import { getLandingContent, getLandingMetadata } from '@/lib/marketing/landingCopy'
import { getSiteContact } from '@/lib/marketing/siteContact'
import { getPublicPricingRows } from '@/lib/marketing/publicPricing'

/** Landing copy comes from code + auth check; avoid serving a stale cached HTML shell. */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return getLandingMetadata(locale)
}

export default async function RootPage() {
  noStore()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  const locale = await getLocale()
  const content = getLandingContent(locale)
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const siteContact = getSiteContact()
  // Prices come from saas_plans, not from the copy file, so the landing page
  // and checkout can never quote different numbers.
  const pricingRows = await getPublicPricingRows()

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
