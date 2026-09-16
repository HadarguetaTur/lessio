import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { LegalSimpleLayout } from '@/components/marketing/LegalSimpleLayout'
import { getSiteContact } from '@/lib/marketing/siteContact'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.dataDeletion')
  return {
    title: t('title'),
    description: t('metaDescription'),
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default async function DataDeletionPage() {
  const tLegal = await getTranslations('legal')
  const t = await getTranslations('legal.dataDeletion')

  const { supportEmail } = getSiteContact()
  const email = supportEmail || 'support@getlessio.com'

  const [contactBefore, contactAfter] = (t.raw('sections.contact.body') as string).split(
    '{email}'
  )

  const emailLink = <a href={`mailto:${email}`}>{email}</a>

  return (
    <LegalSimpleLayout title={t('title')} meta={`${tLegal('lastUpdated')}: ${t('lastUpdatedDate')}`}>
      <div className="space-y-8">
        <p>{t('intro')}</p>

        <Section title={t('sections.whatData.heading')}>
          <p>{t('sections.whatData.body')}</p>
          <Ul items={t.raw('sections.whatData.items') as string[]} />
        </Section>

        <Section title={t('sections.whatsappNote.heading')}>
          <p>{t('sections.whatsappNote.body')}</p>
        </Section>

        <Section title={t('sections.howToRequest.heading')}>
          <p>{t('sections.howToRequest.body')}</p>
          <Ul
            items={(t.raw('sections.howToRequest.items') as string[]).map((item) =>
              item.replace('{email}', email)
            )}
          />
          <p>{t('sections.howToRequest.note')}</p>
        </Section>

        <Section title={t('sections.whatHappens.heading')}>
          <p>{t('sections.whatHappens.body')}</p>
          <Ul items={t.raw('sections.whatHappens.items') as string[]} />
        </Section>

        <Section title={t('sections.contact.heading')}>
          <p>
            {contactBefore}
            {emailLink}
            {contactAfter}
          </p>
          <p>
            <Link href="/privacy">{tLegal('privacy.title')}</Link>
          </p>
        </Section>
      </div>
    </LegalSimpleLayout>
  )
}
