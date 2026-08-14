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
      <h2 className="text-base font-semibold text-foreground mb-2">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-3">{children}</div>
    </section>
  )
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 ps-2">
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

  const emailLink = (
    <a
      href={`mailto:${email}`}
      className="text-violet-600 hover:underline dark:text-violet-400"
    >
      {email}
    </a>
  )

  return (
    <LegalSimpleLayout>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('title')}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {tLegal('lastUpdated')}: {t('lastUpdatedDate')}
      </p>

      <div className="mt-8 space-y-8">
        <p className="text-sm leading-relaxed text-muted-foreground">{t('intro')}</p>

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
            <Link
              href="/privacy"
              className="text-violet-600 hover:underline dark:text-violet-400"
            >
              {tLegal('privacy.title')}
            </Link>
          </p>
        </Section>
      </div>

      <div className="mt-12">
        <Link
          href="/"
          className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          &larr; {tLegal('backHome')}
        </Link>
      </div>
    </LegalSimpleLayout>
  )
}
