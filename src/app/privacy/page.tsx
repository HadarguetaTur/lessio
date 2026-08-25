import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { LegalSimpleLayout } from '@/components/marketing/LegalSimpleLayout'
import { getSiteContact } from '@/lib/marketing/siteContact'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { PrivacyHe } from './PrivacyHe'
import { PrivacyEn } from './PrivacyEn'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy')
  return {
    title: t('title'),
    description: t('metaDescription'),
  }
}

/** Fixed company details — a registered name, number and postal address. */
const ENTITY_NAME = 'תורג\'מן גואטה הדר מזל'
const ENTITY_NUMBER = '204174361'
const CONTACT_ADDRESS = 'נוקדים כפר אלדד 142, ישראל'
const CONTACT_PHONE = '050-434-3547'

/** The policy is versioned by hand; this is the date the text last changed. */
const LAST_UPDATED_ISO = '2026-08-25'

export default async function PrivacyPage() {
  const tLegal = await getTranslations('legal')
  const locale = parseAppLocale(await getLocale())
  const { supportEmail } = getSiteContact()

  const email = supportEmail || 'support@getlessio.com'

  const lastUpdated = new Date(LAST_UPDATED_ISO).toLocaleDateString(toIntlLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const docProps = {
    email,
    addr: CONTACT_ADDRESS,
    tel: CONTACT_PHONE,
    reg: ENTITY_NUMBER,
    entityName: ENTITY_NAME,
  }

  return (
    <LegalSimpleLayout>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {tLegal('privacy.title')}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {tLegal('version', { version: '1.0' })} · {tLegal('lastUpdated')}: {lastUpdated}
      </p>

      {locale === 'en' ? <PrivacyEn {...docProps} /> : <PrivacyHe {...docProps} />}

      <Link
        href="/"
        className="mt-10 inline-flex text-sm font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
      >
        {tLegal('backHome')}
      </Link>
    </LegalSimpleLayout>
  )
}
