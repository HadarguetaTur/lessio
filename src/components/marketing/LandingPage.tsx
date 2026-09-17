import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { DiaryFooter } from '@/components/diary/DiaryFooter'
import { DiaryHeader } from '@/components/diary/DiaryHeader'
import { DiaryShell } from '@/components/diary/DiaryShell'
import { LandingCtaTracker } from '@/components/marketing/LandingCtaTracker'
import { LandingFaqAccordion } from '@/components/marketing/LandingFaqAccordion'
import {
  PenCheck,
  PenCheckbox,
  PenClip,
  PenQuietBubble,
  PenSeal,
  PenToggle,
  PenUnderline,
  PenX,
} from '@/components/marketing/LandingPenMarks'
import { LandingPricing } from '@/components/marketing/LandingPricing'
import { LandingStickyCta } from '@/components/marketing/LandingStickyCta'
import { LandingWeekSpread } from '@/components/marketing/LandingWeekSpread'
import { LandingWhatsAppChat } from '@/components/marketing/LandingWhatsAppChat'
import { cn } from '@/lib/utils'
import type { PublicPricingRow } from '@/lib/marketing/publicPricing'
import {
  DEMO_VIDEO_URL,
  LANDING_IMAGE_SIZES,
  landingImageSrc,
  type LandingContent,
  type LandingImageKey,
} from '@/lib/marketing/landingCopy'
import type { SiteContact } from '@/lib/marketing/siteContact'

/**
 * The landing page is set as a teacher's paper week diary. The shell, faces,
 * cover strip and back cover live in src/components/diary and are shared with
 * the auth and legal pages.
 */

/** Official channel → human takeover → confirmations → parent control, in the copy's order. */
const TRUST_DOODLES = [PenSeal, PenQuietBubble, PenCheckbox, PenToggle] as const

/** Phone captures carry their content at the bottom of the thread. */
const BOTTOM_ANCHORED: ReadonlySet<LandingImageKey> = new Set(['wa-cancel-flow', 'wa-payment-request'])

/** A real screenshot, clipped into the diary. */
function Clip({
  locale,
  image,
  alt,
  className,
  tilt = 'a',
  sizes = '(min-width: 1024px) 34rem, 100vw',
}: {
  locale: string
  image: LandingImageKey
  alt: string
  className?: string
  tilt?: 'a' | 'b'
  sizes?: string
}) {
  const size = LANDING_IMAGE_SIZES[image]
  const portrait = size.height > size.width
  return (
    <figure className={cn('clip', tilt === 'a' ? 'tilt-a' : 'tilt-b', portrait && 'max-h-[24rem] overflow-hidden', className)}>
      <PenClip className="paperclip" />
      <Image
        src={landingImageSrc(locale, image)}
        alt={alt}
        width={size.width}
        height={size.height}
        sizes={sizes}
        className={cn(portrait && 'h-[24rem] w-full object-cover', portrait && (BOTTOM_ANCHORED.has(image) ? 'object-bottom' : 'object-top'))}
      />
    </figure>
  )
}

/** A diary page: a section with the ruled paper and a page heading. */
function Page({
  id,
  children,
  className,
  ruled = true,
}: {
  id: string
  children: ReactNode
  className?: string
  ruled?: boolean
}) {
  return (
    <section id={id} className={cn('scroll-mt-16', ruled && 'ruled', className)}>
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">{children}</div>
    </section>
  )
}

/** A page title, underlined by the pen as it scrolls into view. Centred on phones. */
function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mx-auto max-w-[40rem] text-center sm:mx-0 sm:text-start" data-pen>
      <h2 className="display text-[2rem] sm:text-[2.5rem] lg:text-[2.9rem]">
        <span className="title-pen">
          {title}
          <PenUnderline />
        </span>
      </h2>
      {intro ? <p className="mx-auto mt-4 max-w-[58ch] text-[color:var(--ink-2)] sm:mx-0 sm:text-lg">{intro}</p> : null}
    </header>
  )
}

export function LandingPage({
  content,
  dir,
  locale,
  pricingRows = [],
  siteContact = { address: '', supportEmail: '', phone: '', registrationNumber: '' },
}: {
  content: LandingContent
  dir: 'rtl' | 'ltr'
  locale: string
  pricingRows?: PublicPricingRow[]
  siteContact?: SiteContact
}) {
  const { hero, chain, problem, capabilities, implementation, israel, trust, audience, pricing, faq, finalCta, footer, links, nav } =
    content

  const tabs = [
    ['week', nav.tabs.week],
    ['chain', nav.tabs.chain],
    ['problem', nav.tabs.problem],
    ['centre', nav.tabs.centre],
    ['rollout', nav.tabs.rollout],
    ['trust', nav.tabs.trust],
    ['audience', nav.tabs.audience],
    ['pricing', nav.tabs.pricing],
    ['faq', nav.tabs.faq],
  ] as const

  return (
    <DiaryShell dir={dir} skipTo="week" skipLabel={nav.tabs.week}>
      <DiaryHeader
        locale={locale}
        wordmarkHref="#week"
        nav={
          <nav className="ms-6 hidden items-center gap-5 md:flex" aria-label="Sections">
            {(
              [
                [nav.howItWorks, '#chain'],
                [nav.pricing, '#pricing'],
                [nav.faq, '#faq'],
              ] as const
            ).map(([label, href]) => (
              <a key={href} href={href} className="muted text-sm font-semibold hover:!text-[color:var(--cover-ink)] hover:underline">
                {label}
              </a>
            ))}
          </nav>
        }
        actions={
          <>
            <Link href={links.login} className="min-h-9 text-sm font-semibold leading-9 hover:underline">
              {nav.login}
            </Link>
            <Link href={links.signup} data-cta="nav-signup" className="hl-cta !text-[1rem]">
              {nav.signup}
            </Link>
          </>
        }
      />

      {/* Thumb index: one tab per page. */}
      <nav className="tabs" aria-label={nav.tabs.week}>
        {tabs.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <main className="flex flex-1 flex-col">
        {/* ── The week ─────────────────────────────────────────────────── */}
        <section id="week" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
            <div className="rule-b pb-2 text-center sm:text-start">
              <p className="pen whitespace-nowrap text-[1.5rem] sm:text-[1.75rem]">{hero.diary.weekLabel}</p>
            </div>

            {/* Below lg the headline is written above the spread. */}
            <div className="py-8 lg:hidden">
              <Headline hero={hero} links={links} />
            </div>

            <div className="spread-scope relative">
              <LandingWeekSpread diary={hero.diary} />

              {/* lg+: the headline is a note across the spread's top rows, the
                  chat a printout clipped over the far columns; the story
                  entry at 14:00 stays in the clear beneath the note. */}
              <div
                className="pointer-events-none absolute inset-x-0 hidden lg:block"
                style={{ top: 'var(--line)', insetInlineStart: '4rem', height: 'calc(var(--line) * 5)' }}
              >
                <div className="pointer-events-auto h-full bg-[color:var(--paper)] px-6 pt-3">
                  <Headline hero={hero} links={links} compact />
                </div>
              </div>
              <div
                className="pointer-events-none absolute hidden lg:block"
                style={{ top: 'calc(var(--line) * 6.6)', insetInlineEnd: '1.25%', width: '21%' }}
              >
                <div className="pointer-events-auto">
                  <Printout hero={hero} />
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-[22rem] py-10 lg:hidden">
              <Printout hero={hero} />
            </div>

            <p className="pb-6 text-center text-[0.7rem] text-[color:var(--ink-3)] sm:text-start sm:text-xs lg:pt-3">{hero.diary.synthetic}</p>
          </div>
        </section>

        {/* ── One cancellation, page by page ────────────────────────────── */}
        <Page id="chain" className="rule-t">
          <PageTitle title={chain.title} intro={chain.intro} />
          <ol className="rule-t mt-12 list-none">
            {chain.beats.map((beat, index) => (
              <li key={beat.title} className="rule-b grid gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:py-14">
                <div className="flex gap-4">
                  <span className="pen pen-red mt-1 w-8 shrink-0 text-[2.25rem] leading-none" aria-hidden>
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="display text-[1.5rem] sm:text-[1.75rem]">{beat.title}</h3>
                    <p className="mt-3 max-w-[52ch] text-[color:var(--ink-2)]">{beat.body}</p>
                  </div>
                </div>
                <div className="ps-12 lg:ps-0">
                  {index === 1 ? (
                    <PolicyTable card={chain.policyCard} />
                  ) : index === 5 ? (
                    <div className="clip tilt-b mx-auto w-full max-w-[18rem]">
                      <PenClip className="paperclip" />
                      <LandingWhatsAppChat contactName={hero.chat.contactName} statusLabel={hero.chat.statusLabel} messages={chain.paymentChat.messages} />
                    </div>
                  ) : beat.image ? (
                    <Clip
                      locale={locale}
                      image={beat.image}
                      alt={beat.title}
                      tilt={index % 2 ? 'b' : 'a'}
                      className={LANDING_IMAGE_SIZES[beat.image].height > LANDING_IMAGE_SIZES[beat.image].width ? 'mx-auto w-full max-w-[16rem]' : ''}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-col items-center gap-5 text-center sm:flex-row sm:items-baseline sm:gap-8 sm:text-start">
            <Link href={links.signup} data-cta="chain-primary" className="hl-cta">
              {chain.cta}
            </Link>
            <a
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cta="chain-video"
              className="pen text-[1.5rem] text-[color:var(--ink-2)] underline decoration-[color:var(--rule)] decoration-2 underline-offset-[6px] hover:text-[color:var(--ink)] hover:decoration-[color:var(--ink)]"
            >
              {chain.videoLink}
            </a>
          </div>
        </Page>

        {/* ── Without a system ──────────────────────────────────────────── */}
        <Page id="problem">
          <PageTitle title={problem.title} />
          <ul className="rule-t mt-10 max-w-[44rem] list-none">
            {problem.items.map((item) => (
              <li key={item.title} className="rule-b grid gap-1 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
                <h3 className="pen-underline text-[1.2rem] font-bold">{item.title}</h3>
                <p className="text-[color:var(--ink-2)]">{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="display mx-auto mt-10 max-w-[30ch] text-center text-[1.5rem] sm:mx-0 sm:text-start sm:text-[1.9rem]">{problem.closing}</p>
        </Page>

        {/* ── The centre, from one system ───────────────────────────────── */}
        <Page id="centre">
          <PageTitle title={capabilities.title} intro={capabilities.intro} />
          <ul className="rule-t mt-12 list-none">
            {capabilities.items.map((item, i) => (
              <li
                key={item.title}
                className={cn(
                  'rule-b grid items-center gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14',
                  i % 2 === 1 && 'lg:[&>*:first-child]:order-last'
                )}
              >
                <div className="text-center sm:text-start">
                  <p className="pen pen-red text-[1.6rem]">{item.title}</p>
                  <p className="mx-auto mt-2 max-w-[44ch] text-[color:var(--ink-2)] sm:mx-0">{item.body}</p>
                </div>
                <Clip
                  locale={locale}
                  image={item.image}
                  alt={item.title}
                  tilt={i % 2 ? 'b' : 'a'}
                  className={LANDING_IMAGE_SIZES[item.image].height > LANDING_IMAGE_SIZES[item.image].width ? 'mx-auto w-full max-w-[15rem]' : ''}
                  sizes="(min-width: 1024px) 36rem, 100vw"
                />
              </li>
            ))}
          </ul>

          <div className="mt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-14">
            <h3 className="display mx-auto max-w-[16ch] text-center text-[1.5rem] sm:mx-0 sm:text-start sm:text-[1.75rem]">{israel.title}</h3>
            <ul className="rule-t mt-5 list-none lg:mt-0">
              {israel.items.map((item) => (
                <li key={item} className="rule-b flex items-start gap-3 py-3">
                  <PenCheck className="mt-1 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Page>

        {/* ── Rollout ───────────────────────────────────────────────────── */}
        <Page id="rollout">
          <PageTitle title={implementation.title} intro={implementation.intro} />
          <ol className="rule-t mt-10 max-w-[52rem] list-none">
            {implementation.steps.map(([title, body], i) => (
              <li key={title} className="rule-b grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-5 sm:grid-cols-[2.5rem_14rem_minmax(0,1fr)] sm:gap-x-6">
                <span className="pen pen-red row-span-2 text-[2.25rem] leading-none sm:row-span-1" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="text-[1.2rem] font-bold">{title}</h3>
                <p className="text-[color:var(--ink-2)]">{body}</p>
              </li>
            ))}
          </ol>
        </Page>

        {/* ── Trust ─────────────────────────────────────────────────────── */}
        <Page id="trust">
          <PageTitle title={trust.title} />
          <ul className="rule-t mt-10 max-w-[56rem] list-none" data-pen>
            {trust.items.map((item, i) => {
              const Doodle = TRUST_DOODLES[i] ?? PenSeal
              return (
                <li
                  key={item.title}
                  className="rule-b grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-6 sm:grid-cols-[4.5rem_15rem_minmax(0,1fr)] sm:gap-x-6"
                >
                  <Doodle className="doodle row-span-2 size-12 sm:row-span-1 sm:size-14" style={{ '--doodle-delay': `${i * 260}ms` } as CSSProperties} />
                  <h3 className="text-[1.2rem] font-bold">{item.title}</h3>
                  <p className="max-w-[52ch] text-[color:var(--ink-2)]">{item.body}</p>
                </li>
              )
            })}
          </ul>
        </Page>

        {/* ── Who it is for ─────────────────────────────────────────────── */}
        <Page id="audience">
          <PageTitle title={audience.title} intro={audience.subtitle} />
          <div className="rule-t mt-10 grid sm:grid-cols-2">
            <div className="rule-b py-6 pe-6">
              <h3 className="display text-[1.4rem]">{audience.forTitle}</h3>
              <ul className="mt-4 list-none space-y-3">
                {audience.forBullets.map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <PenCheck className="mt-1 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rule-b py-6 sm:rule-s sm:ps-6">
              <h3 className="display text-[1.4rem] text-[color:var(--ink-2)]">{audience.notForTitle}</h3>
              <ul className="mt-4 list-none space-y-3 text-[color:var(--ink-2)]">
                {audience.notForBullets.map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <PenX className="pen-red mt-1 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="display mx-auto mt-10 max-w-[34ch] text-center text-[1.5rem] sm:mx-0 sm:text-start sm:text-[1.9rem]">{audience.closing}</p>
        </Page>

        {/* ── Plans ─────────────────────────────────────────────────────── */}
        {pricingRows.length > 0 ? (
          <Page id="pricing">
            <LandingPricing copy={pricing} rows={pricingRows} locale={locale} signupHref={links.signup} />
          </Page>
        ) : null}

        {/* ── Questions ─────────────────────────────────────────────────── */}
        <Page id="faq">
          <div className="max-w-[46rem]">
            <h2 className="display text-center text-[2rem] sm:text-start sm:text-[2.5rem]" data-pen>
              <span className="title-pen">
                {faq.title}
                <PenUnderline />
              </span>
            </h2>
            <LandingFaqAccordion items={faq.items} dir={dir} />
          </div>
        </Page>

        {/* ── The inside back cover ─────────────────────────────────────── */}
        <section className="cover">
          <div className="mx-auto grid w-full max-w-7xl gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:px-8 lg:py-28">
            <div className="text-center sm:text-start">
              <h2 className="display mx-auto max-w-[22ch] text-[2rem] sm:mx-0 sm:text-[2.75rem] lg:text-[3.25rem]">{finalCta.title}</h2>
              <p className="muted mx-auto mt-5 max-w-[52ch] text-lg sm:mx-0">{finalCta.body}</p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-start">
                <Link href={links.signup} data-cta="final-cta" className="hl-cta">
                  {finalCta.cta}
                </Link>
                <p className="muted text-sm">{finalCta.note}</p>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[28rem] lg:mx-0 lg:justify-self-end">
              <Ledger ledger={chain.ledger} />
            </div>
          </div>
        </section>
      </main>

      <DiaryFooter copy={footer} siteContact={siteContact} className="pb-24 sm:pb-10" />

      <LandingStickyCta href={links.signup} label={hero.ctaPrimary} note={pricing.trialNote} />
      <LandingCtaTracker />
    </DiaryShell>
  )
}

function Headline({ hero, links, compact = false }: { hero: LandingContent['hero']; links: LandingContent['links']; compact?: boolean }) {
  return (
    <div className={cn(compact ? 'grid h-full grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-10' : 'flex flex-col gap-5 text-center sm:text-start')}>
      <h1 className={cn('display', compact ? 'text-[2.3rem] xl:text-[2.7rem]' : 'text-[2.25rem] sm:text-[2.9rem]')}>
        <span className="block text-balance">
          {hero.headline.less}
          {hero.headline.lessRest}
        </span>
        {`${hero.headline.more}${hero.headline.moreRest}` ? (
          <span className="block">
            {hero.headline.more}
            {hero.headline.moreRest}
          </span>
        ) : null}
      </h1>
      <div className={cn(compact && 'pt-1')}>
        <p className={cn('max-w-[52ch] text-[color:var(--ink-2)]', compact ? 'text-[1.02rem] leading-[1.5]' : 'mx-auto text-lg sm:mx-0')}>{hero.subheadline}</p>
        <div className={cn('flex flex-col gap-2', compact ? 'mt-3 items-start' : 'mt-6 items-center sm:items-start')}>
          <Link href={links.signup} data-cta="hero-primary" className="hl-cta">
            {hero.ctaPrimary}
          </Link>
          <p className="text-sm text-[color:var(--ink-2)]">{hero.trustLine}</p>
        </div>
        {hero.forLine ? <p className={cn('pen pen-red text-[1.35rem]', compact ? 'mt-2' : 'mt-4')}>{hero.forLine}</p> : null}
      </div>
    </div>
  )
}

function Printout({ hero }: { hero: LandingContent['hero'] }) {
  return (
    <div className="clip tilt-b">
      <PenClip className="paperclip" />
      <LandingWhatsAppChat contactName={hero.chat.contactName} statusLabel={hero.chat.statusLabel} messages={hero.chat.messages} />
    </div>
  )
}

/** Beat 2: the policy, as the diary's printed front-matter table. */
function PolicyTable({ card }: { card: LandingContent['chain']['policyCard'] }) {
  return (
    <div className="max-w-[24rem]">
      <p className="display rule-b pb-2 text-[1.25rem]">{card.title}</p>
      <ul className="list-none">
        {card.rules.map((rule) => (
          <li key={rule} className="rule-b py-2.5">
            {rule}
          </li>
        ))}
      </ul>
      <p className="pen mt-3 text-[1.6rem]">
        <span className="hl-mark">{card.result}</span>
      </p>
    </div>
  )
}

/**
 * The month-end summary page at the back of the diary, on the cover. The
 * cancellation line arrives from above and is marked, the same pen that
 * struck the entry on the week spread; the month closes under it.
 */
function Ledger({ ledger }: { ledger: LandingContent['chain']['ledger'] }) {
  return (
    <div className="w-full" data-pen>
      <p className="display rule-b pb-2 text-[1.35rem]">{ledger.title}</p>
      <ul className="list-none">
        {ledger.rows.map(([label, amount], i) => {
          const story = i === ledger.rows.length - 1
          return (
            <li key={label} className={cn('rule-b flex items-baseline justify-between gap-4 py-3', story && 'arrive font-bold')}>
              <span>{label}</span>
              {story ? (
                <span className="sweep tabular text-[1.35rem]">
                  <span>{amount}</span>
                </span>
              ) : (
                <span className="tabular">{amount}</span>
              )}
            </li>
          )
        })}
        <li className="flex items-baseline justify-between gap-4 py-3 text-[1.15rem] font-bold">
          <span>{ledger.total[0]}</span>
          <span className="tabular">{ledger.total[1]}</span>
        </li>
      </ul>
      <p className="after-note pen mt-3 text-[1.6rem] text-[color:var(--hl)]">{ledger.approved}</p>
    </div>
  )
}
