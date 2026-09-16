import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { DiaryFooter } from '@/components/diary/DiaryFooter'
import { DiaryHeader } from '@/components/diary/DiaryHeader'
import { DiaryShell } from '@/components/diary/DiaryShell'
import { PenUnderline } from '@/components/marketing/LandingPenMarks'
import { getLandingContent } from '@/lib/marketing/landingCopy'
import { getSiteContact } from '@/lib/marketing/siteContact'

/**
 * A legal document as a page of the diary: the cover strip, one reading
 * column on ruled paper, the title underlined by the pen, the version line
 * in the pen's hand under it (never above), and the back cover with the
 * legal links. The document prose itself is styled by `.legal-doc`.
 */
export async function LegalSimpleLayout({
  title,
  meta,
  children,
}: {
  title: string
  /** The version / last-updated line, shown in the pen's hand under the title. */
  meta?: ReactNode
  children: ReactNode
}) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const t = await getTranslations('legal')
  const tAuth = await getTranslations('auth.common')
  const { footer } = getLandingContent(locale)

  return (
    <DiaryShell dir={dir} skipTo="legal-doc" skipLabel={title}>
      <DiaryHeader
        locale={locale}
        wordmarkHref="/"
        wordmarkLabel={tAuth('backToHome')}
        actions={
          <Link href="/" className="min-h-9 text-sm font-semibold leading-9 hover:underline">
            {t('backHome')}
          </Link>
        }
      />

      <main id="legal-doc" className="ruled flex-1 px-4 py-12 sm:px-6 lg:py-16">
        <article className="legal-doc mx-auto w-full max-w-[68ch]">
          <h1 className="display text-[2rem] sm:text-[2.6rem]" data-pen>
            <span className="title-pen">
              {title}
              <PenUnderline />
            </span>
          </h1>
          {meta ? <p className="pen mt-3 text-[1.35rem] text-[color:var(--ink-3)]">{meta}</p> : null}
          <div className="mt-8">{children}</div>
          <p className="mt-12">
            <Link href="/" className="link-rule">
              {t('backHome')}
            </Link>
          </p>
        </article>
      </main>

      <DiaryFooter copy={footer} siteContact={getSiteContact()} />
    </DiaryShell>
  )
}
