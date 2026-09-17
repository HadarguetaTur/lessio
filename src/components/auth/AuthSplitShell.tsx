import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { DiaryFooter } from '@/components/diary/DiaryFooter'
import { DiaryHeader } from '@/components/diary/DiaryHeader'
import { DiaryShell } from '@/components/diary/DiaryShell'
import { PenCheck } from '@/components/marketing/LandingPenMarks'
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
  const { authCover, pricing, footer } = content

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
        <aside className="cover flex flex-col justify-center px-4 py-5 text-center sm:px-6 lg:justify-start lg:px-12 lg:py-0 lg:text-start">
          <p className="pen text-[1.2rem] leading-tight text-[color:var(--cover-ink-2)] lg:hidden">{authCover.mobileLine}</p>
          {/* Starts on the note title's line and stays in view while a long form scrolls. */}
          <div className="mx-auto hidden w-full max-w-[30rem] lg:sticky lg:top-14 lg:block lg:pb-16 lg:pt-24">
            <p className="display text-[2.2rem] leading-[1.12] xl:text-[2.6rem]">
              {authCover.headline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
            <p className="mt-6 max-w-[44ch] text-lg text-[color:var(--cover-ink-2)]">{authCover.body}</p>

            {/* The morning page: the same ledger hand as the landing's back cover. */}
            <div className="mt-10">
              <p className="pen rule-b pb-1 text-[1.5rem] text-[color:var(--cover-ink-2)]">{authCover.morning.title}</p>
              <ul className="list-none">
                {authCover.morning.rows.map(([what, outcome]) => (
                  <li key={what} className="rule-b flex items-center gap-3 py-2.5">
                    <PenCheck className="shrink-0 text-[color:var(--hl)]" />
                    <span className="min-w-0 flex-1">{what}</span>
                    <span className="tabular shrink-0 font-bold">{outcome}</span>
                  </li>
                ))}
              </ul>
              <p className="pen mt-3 text-[1.6rem] text-[color:var(--hl)]">{authCover.morning.note}</p>
            </div>

            {highlightTrial ? (
              <p className="pen mt-8 text-[1.5rem]">
                <span className="hl-mark text-[color:var(--ink)]">{pricing.trialNote}</span>
              </p>
            ) : null}
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
