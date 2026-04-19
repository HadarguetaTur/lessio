import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { LegalSimpleLayout } from '@/components/marketing/LegalSimpleLayout'
import { getSiteContact } from '@/lib/marketing/siteContact'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.terms')
  return {
    title: t('title'),
    description: t('metaDescription'),
  }
}

const SECTION_KEYS = [
  'serviceDescription',
  'acceptableUse',
  'paymentTerms',
  'termination',
  'governingLaw',
] as const

export default async function TermsPage() {
  const t = await getTranslations('legal.terms')
  const tLegal = await getTranslations('legal')
  const { supportEmail } = getSiteContact()
  const contactEmail = supportEmail || 'support@lessio.app'
  const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <LegalSimpleLayout>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('title')}
      </h1>
      <p className="mt-2 text-xs text-muted-foreground">
        {tLegal('lastUpdated')}: {today}
      </p>

      <div className="mt-8 space-y-8">
        {SECTION_KEYS.map((key) => (
          <section key={key}>
            <h2 className="text-base font-semibold text-foreground mb-2">
              {t(`sections.${key}.heading`)}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(`sections.${key}.body`, { email: contactEmail })}
            </p>
          </section>
        ))}
      </div>

      <Link
        href="/"
        className="mt-10 inline-flex text-sm font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
      >
        {tLegal('backHome')}
      </Link>
    </LegalSimpleLayout>
  )
}
