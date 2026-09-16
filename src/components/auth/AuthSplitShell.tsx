import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { DiaryFooter } from '@/components/diary/DiaryFooter'
import { DiaryHeader } from '@/components/diary/DiaryHeader'
import { DiaryShell } from '@/components/diary/DiaryShell'
import { getLandingContent } from '@/lib/marketing/landingCopy'
import { getSiteContact } from '@/lib/marketing/siteContact'

/**
 * The diary, opened at a note page: the cover on the reading-start side
 * carries the one promise from the landing page, the paper on the other
 * side carries the form. On phones the cover shrinks to the header strip
 * and one line in the pen's hand above the note.
 */
export async function AuthSplitShell({ children, highlightTrial = false }: { children: ReactNode; highlightTrial?: boolean }) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const t = await getTranslations('auth.common')
  const content = getLandingContent(locale)
  const { hero, pricing, footer } = content

  return (
    <DiaryShell dir={dir} skipTo="auth-note" skipLabel={t('skipToForm')}>
      <DiaryHeader
        locale={locale}
        wordmarkHref="/"
        wordmarkLabel={t('backToHome')}
        actions={
          <Link href="/" className="min-h-9 text-sm font-semibold leading-9 hover:underline">
            {t('backToHome')}
          </Link>
        }
      />

      <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <aside className="cover flex flex-col justify-center px-4 py-5 text-center sm:px-6 lg:justify-start lg:px-12 lg:py-16 lg:text-start">
          <p className="pen text-[1.2rem] leading-tight text-[color:var(--cover-ink-2)] lg:hidden">
            {hero.headline.less}
            {hero.headline.lessRest}
          </p>
          <div className="hidden lg:block">
            <p className="display max-w-[16ch] text-[2.4rem] leading-[1.1] xl:text-[2.9rem]">
              <span className="block">
                {hero.headline.less}
                {hero.headline.lessRest}
              </span>
              <span className="block">
                {hero.headline.more}
                {hero.headline.moreRest}
              </span>
            </p>
            <p className="mt-8 max-w-[44ch] text-lg text-[color:var(--cover-ink-2)]">{hero.subheadline}</p>
            <p className="pen mt-10 text-[1.6rem]">
              {highlightTrial ? <span className="hl-mark text-[color:var(--ink)]">{pricing.trialNote}</span> : pricing.trialNote}
            </p>
          </div>
        </aside>

        <div id="auth-note" className="np-column ruled flex justify-center px-4 sm:px-6 lg:items-start lg:px-12">
          {children}
        </div>
      </main>

      <DiaryFooter copy={footer} siteContact={getSiteContact()} />
    </DiaryShell>
  )
}
