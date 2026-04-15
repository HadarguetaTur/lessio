import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { LegalSimpleLayout } from '@/components/marketing/LegalSimpleLayout'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy')
  return {
    title: t('title'),
    description: t('metaDescription'),
  }
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal.privacy')
  const tLegal = await getTranslations('legal')

  return (
    <LegalSimpleLayout>
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('title')}
      </h1>
      <p className="mt-5 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
        {t('placeholder')}
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex text-sm font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
      >
        {tLegal('backHome')}
      </Link>
    </LegalSimpleLayout>
  )
}
