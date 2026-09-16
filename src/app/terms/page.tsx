import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'

import { LegalSimpleLayout } from '@/components/marketing/LegalSimpleLayout'
import { getSiteContact } from '@/lib/marketing/siteContact'
import { getPublicPricingRows } from '@/lib/marketing/publicPricing'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { TermsHe } from './TermsHe'
import { TermsEn } from './TermsEn'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.terms')
  return {
    title: t('title'),
    description: t('metaDescription'),
  }
}

export default async function TermsPage() {
  const tLegal = await getTranslations('legal')
  const locale = parseAppLocale(await getLocale())
  const { supportEmail, address, phone, registrationNumber } = getSiteContact()

  const email = supportEmail || 'support@getlessio.com'
  // The registered address is a postal address, so it is not translated.
  const addr = address || 'נוקדים, כפר אלדד 142, ישראל'
  const tel = phone || '050-4343547'
  const reg = registrationNumber || '204174361'

  const today = new Date().toLocaleDateString(toIntlLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const pricing = await getPublicPricingRows()
  const docProps = { email, addr, tel, reg, pricing }

  return (
    <LegalSimpleLayout
      title={tLegal('terms.title')}
      meta={`${tLegal('version', { version: '1.0' })} · ${tLegal('lastUpdated')}: ${today}`}
    >
      {locale === 'en' ? <TermsEn {...docProps} /> : <TermsHe {...docProps} />}
    </LegalSimpleLayout>
  )
}
