import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import localFont from 'next/font/local'
import {
  ArrowDown,
  BadgeCheck,
  CalendarX,
  Check,
  CheckCheck,
  FileQuestion,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'

import { AuthPageDecorations } from '@/components/auth/AuthPageDecorations'
import { LandingCtaTracker } from '@/components/marketing/LandingCtaTracker'
import { LandingFaqAccordion } from '@/components/marketing/LandingFaqAccordion'
import { LandingLocaleToggle } from '@/components/marketing/LandingLocaleToggle'
import { LandingPricing } from '@/components/marketing/LandingPricing'
import { LandingReveal } from '@/components/marketing/LandingReveal'
import { LandingStagger } from '@/components/marketing/LandingStagger'
import { LandingStickyCta } from '@/components/marketing/LandingStickyCta'
import { LandingWhatsAppChat } from '@/components/marketing/LandingWhatsAppChat'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PublicPricingRow } from '@/lib/marketing/publicPricing'
import {
  LANDING_IMAGE_SIZES,
  landingImageSrc,
  type LandingContent,
  type LandingImageKey,
} from '@/lib/marketing/landingCopy'
import type { SiteContact } from '@/lib/marketing/siteContact'

/**
 * Geist (the app font) has no Hebrew glyphs, so Hebrew headlines were falling
 * back to system fonts. Heebo is the deliberate Hebrew pairing — the same face
 * the OG image already uses.
 */
const heebo = localFont({
  src: [
    { path: '../../../public/fonts/Heebo-Regular.ttf', weight: '400' },
    { path: '../../../public/fonts/Heebo-Bold.ttf', weight: '700' },
  ],
  display: 'swap',
  fallback: ['system-ui', 'arial'],
})

const PROBLEM_ICONS = [Wallet, CalendarX, FileQuestion] as const

/**
 * Where to anchor the crop of each tall (phone) screenshot: WhatsApp captures
 * carry their content at the bottom of the thread, portal/dashboard at the top.
 */
const IMAGE_CROP: Partial<Record<LandingImageKey, string>> = {
  'wa-cancel-flow': 'object-bottom',
  'wa-payment-request': 'object-bottom',
}

/** Official channel → human takeover → confirmations → parent control */
const TRUST_ICONS = [BadgeCheck, UserRound, CheckCheck, ShieldCheck] as const

const HERO_MOTION =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-both motion-reduce:animate-none'

function CtaLink({
  href,
  className,
  dataCta,
  children,
}: {
  href: string
  className?: string
  dataCta?: string
  children: ReactNode
}) {
  const external = href.startsWith('http://') || href.startsWith('https://')
  if (external) {
    return (
      <a href={href} className={className} data-cta={dataCta} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} data-cta={dataCta}>
      {children}
    </Link>
  )
}

/** The one gradient on the page (besides the logo): the primary CTA. */
function PrimaryCta({
  href,
  dataCta,
  children,
}: {
  href: string
  dataCta: string
  children: ReactNode
}) {
  return (
    <Button
      size="lg"
      className="h-12 min-h-12 w-full min-w-[11rem] border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-7 text-base font-semibold text-white shadow-md shadow-teal-600/15 transition-[filter,box-shadow,transform] duration-300 hover:scale-[1.02] hover:brightness-[1.05] hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100 sm:w-auto"
      asChild
    >
      <CtaLink href={href} dataCta={dataCta}>
        {children}
      </CtaLink>
    </Button>
  )
}

function SectionShell({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'border-t border-border/50 px-4 py-14 sm:px-6 md:py-20 lg:px-8 xl:py-24',
        className
      )}
    >
      {children}
    </section>
  )
}

function SectionTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <LandingReveal variant="blur" className="mx-auto max-w-3xl text-center">
      <h2 className="text-balance text-pretty text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl xl:text-4xl">
        {title}
      </h2>
      {intro ? (
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {intro}
        </p>
      ) : null}
    </LandingReveal>
  )
}

/** A product screenshot in a minimal browser frame. */
function Screenshot({
  locale,
  image,
  alt,
  className,
  imgClassName,
  sizes = '(min-width: 1024px) 32rem, (min-width: 640px) 50vw, 100vw',
  priority = false,
}: {
  locale: string
  image: LandingImageKey
  alt: string
  className?: string
  imgClassName?: string
  sizes?: string
  priority?: boolean
}) {
  const dims = LANDING_IMAGE_SIZES[image]
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/70 bg-card shadow-md shadow-black/[0.06] ring-1 ring-black/[0.03] dark:shadow-black/30 dark:ring-white/[0.04]',
        className
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/60 px-3 py-2" aria-hidden>
        <span className="size-2 rounded-full bg-rose-400/70" />
        <span className="size-2 rounded-full bg-amber-400/70" />
        <span className="size-2 rounded-full bg-emerald-400/70" />
      </div>
      <Image
        src={landingImageSrc(locale, image)}
        alt={alt}
        width={dims.width}
        height={dims.height}
        sizes={sizes}
        priority={priority}
        className={cn('w-full', imgClassName)}
      />
    </div>
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
  const {
    hero,
    chain,
    problem,
    capabilities,
    israel,
    trust,
    audience,
    pricing,
    faq,
    finalCta,
    footer,
    links,
    nav,
  } = content

  return (
    <div
      className={cn(
        // The root <body> is overflow-hidden; this wrapper is the scroll container.
        'relative flex min-h-dvh flex-col overflow-y-auto overflow-x-hidden bg-background',
        locale !== 'en' && heebo.className
      )}
      dir={dir}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[60rem] opacity-40 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000 motion-safe:ease-out motion-safe:fill-mode-both"
        aria-hidden
      >
        <AuthPageDecorations />
      </div>

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-sm shadow-violet-500/15 ring-1 ring-violet-500/10">
              <span className="text-sm font-bold leading-none text-white">L</span>
            </div>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              LESSIO
            </span>
            <nav className="ms-4 hidden items-center gap-1 md:flex" aria-label="Sections">
              {(
                [
                  [nav.howItWorks, '#how-it-works'],
                  [nav.pricing, '#pricing'],
                  [nav.faq, '#faq'],
                ] as const
              ).map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <nav className="flex shrink-0 items-center justify-end gap-1 sm:gap-2" aria-label="Primary">
            <LandingLocaleToggle currentLocale={locale} />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
              asChild
            >
              <Link href={links.login}>{nav.login}</Link>
            </Button>
            <Button
              size="sm"
              className="h-9 bg-foreground px-3.5 text-xs font-semibold text-background transition-opacity hover:bg-foreground hover:opacity-85 sm:text-sm"
              asChild
            >
              <Link href={links.signup} data-cta="nav-signup">
                {nav.signup}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero — the message that closes itself */}
        <section
          id="landing-hero"
          className="relative px-4 pb-16 pt-10 sm:px-6 sm:pt-14 md:pb-20 lg:px-8 xl:pt-20"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 xl:gap-14">
            <div className="text-center lg:text-start">
              <p
                className={cn(
                  'text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-400 sm:text-sm',
                  HERO_MOTION
                )}
              >
                {hero.eyebrow}
              </p>
              <h1
                className={cn(
                  'mt-4 text-balance text-pretty text-[2rem] font-bold leading-[1.15] tracking-tight text-foreground sm:text-4xl sm:leading-[1.12] xl:text-[2.9rem] xl:leading-[1.1]',
                  HERO_MOTION,
                  'motion-safe:delay-75'
                )}
              >
                {hero.headline}
              </h1>
              <p
                className={cn(
                  'mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0',
                  HERO_MOTION,
                  'motion-safe:delay-150'
                )}
              >
                {hero.subheadline}
              </p>

              <div
                className={cn(
                  'mx-auto mt-9 flex max-w-md flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start',
                  HERO_MOTION,
                  'motion-safe:delay-300'
                )}
              >
                <div className="flex w-full flex-col items-center gap-1.5 sm:w-auto lg:items-start">
                  <PrimaryCta href={links.signup} dataCta="hero-primary">
                    {hero.ctaPrimary}
                  </PrimaryCta>
                  <span className="text-xs font-medium text-muted-foreground">
                    {hero.ctaPrimaryNote}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 min-h-12 w-full border-border/90 bg-background/80 px-6 text-base font-semibold shadow-sm backdrop-blur-sm sm:w-auto"
                  asChild
                >
                  <a href={links.howItWorks} data-cta="hero-how">
                    {hero.ctaSecondary}
                    <ArrowDown className="ms-1 size-4" aria-hidden />
                  </a>
                </Button>
              </div>

              <p
                className={cn(
                  'mt-6 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground lg:justify-start',
                  HERO_MOTION,
                  'motion-safe:delay-500'
                )}
              >
                <BadgeCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {hero.trustLine}
              </p>
            </div>

            {/* The chain, live: chat → thread → dashboard card */}
            <div className="mx-auto flex w-full max-w-sm flex-col items-center lg:max-w-none">
              <LandingWhatsAppChat
                contactName={hero.chat.contactName}
                statusLabel={hero.chat.statusLabel}
                messages={hero.chat.messages}
              />
              <div
                className="h-8 w-px bg-gradient-to-b from-emerald-500/70 to-violet-500/50 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:delay-[3200ms] motion-safe:fill-mode-both motion-reduce:animate-none"
                aria-hidden
              />
              <div className="w-full max-w-[21rem] rounded-2xl border border-border/70 bg-card p-4 shadow-lg shadow-black/[0.06] ring-1 ring-black/[0.03] dark:shadow-black/30 dark:ring-white/[0.04] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-600 motion-safe:delay-[3400ms] motion-safe:fill-mode-both motion-reduce:animate-none">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {hero.dashCard.title}
                  </p>
                  <span className="flex size-2 rounded-full bg-rose-500/80" aria-hidden />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5">
                  <p className="min-w-0 truncate text-sm font-medium text-foreground">
                    {hero.dashCard.line}
                  </p>
                  <span className="shrink-0 rounded-lg bg-violet-600/10 px-2 py-1 text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">
                    {hero.dashCard.amount}
                  </span>
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden strokeWidth={3} />
                  {hero.dashCard.slot}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works — one cancellation, step by step */}
        <SectionShell id="how-it-works" className="bg-muted/[0.35]">
          <span id="why-lessio" aria-hidden />
          <div className="mx-auto max-w-5xl">
            <SectionTitle title={chain.title} intro={chain.intro} />
            <ol className="relative mt-14 list-none space-y-14 lg:space-y-20">
              <div
                className="absolute inset-y-2 start-[1.05rem] w-px bg-gradient-to-b from-teal-500/50 via-border to-violet-500/40"
                aria-hidden
              />
              {chain.beats.map((beat, index) => (
                <li key={beat.title} className="relative ps-12 sm:ps-14">
                  <span className="absolute start-0 top-0 flex size-9 items-center justify-center rounded-full border border-border/70 bg-background text-sm font-bold tabular-nums text-foreground shadow-sm">
                    {index + 1}
                  </span>
                  <LandingReveal
                    variant="fade-up"
                    className={cn(
                      'grid items-center gap-6 lg:grid-cols-2 lg:gap-12',
                      index % 2 === 1 && 'lg:[&>*:first-child]:order-last'
                    )}
                  >
                    <div className="text-start">
                      <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                        {beat.title}
                      </h3>
                      <p className="mt-2.5 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                        {beat.body}
                      </p>
                    </div>
                    {beat.image ? (
                      <Screenshot
                        locale={locale}
                        image={beat.image}
                        alt={beat.title}
                        imgClassName={
                          LANDING_IMAGE_SIZES[beat.image].height > LANDING_IMAGE_SIZES[beat.image].width
                            ? cn('max-h-[22rem] object-cover', IMAGE_CROP[beat.image] ?? 'object-top')
                            : undefined
                        }
                        className={
                          LANDING_IMAGE_SIZES[beat.image].height > LANDING_IMAGE_SIZES[beat.image].width
                            ? 'mx-auto w-full max-w-[17rem]'
                            : undefined
                        }
                      />
                    ) : (
                      /* Beat 2 — the policy, typographic. The ₪60 must match the
                         chat, the hero card and the billing screenshot. */
                      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-md ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {chain.policyCard.title}
                        </p>
                        <ul className="mt-3 space-y-2">
                          {chain.policyCard.rules.map((rule) => (
                            <li
                              key={rule}
                              className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm font-medium text-foreground"
                            >
                              {rule}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-4 border-t border-border/60 pt-3.5 text-sm font-bold text-violet-700 dark:text-violet-300">
                          {chain.policyCard.result}
                        </p>
                      </div>
                    )}
                  </LandingReveal>
                </li>
              ))}
            </ol>
          </div>
        </SectionShell>

        {/* Without a system — the pain, once, after the mechanism earned it */}
        <SectionShell>
          <div className="mx-auto max-w-5xl">
            <SectionTitle title={problem.title} />
            <LandingStagger
              as="ul"
              className="mt-10 grid list-none gap-4 sm:grid-cols-3 sm:gap-5"
              stepMs={110}
            >
              {problem.items.map((item, index) => {
                const Icon = PROBLEM_ICONS[index] ?? Wallet
                return (
                  <li
                    key={item.title}
                    className="rounded-2xl border border-border/60 bg-card/90 p-5 text-start shadow-sm ring-1 ring-black/[0.02] dark:bg-card/40 dark:ring-white/[0.04]"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/10 dark:text-rose-300">
                      <Icon className="size-[1.15rem]" aria-hidden />
                    </span>
                    <h3 className="mt-3.5 text-base font-bold text-foreground sm:text-lg">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </li>
                )
              })}
            </LandingStagger>
            <LandingReveal variant="fade-up" className="mx-auto mt-8 max-w-2xl" threshold={0.15}>
              <p className="text-pretty text-center text-base font-bold leading-relaxed text-foreground sm:text-lg">
                {problem.closing}
              </p>
            </LandingReveal>
          </div>
        </SectionShell>

        {/* Capabilities — everything on the same rail, shown not claimed */}
        <SectionShell className="bg-muted/[0.35]">
          <div className="mx-auto max-w-6xl">
            <SectionTitle title={capabilities.title} intro={capabilities.intro} />
            <LandingStagger
              as="ul"
              className="mt-12 grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3"
              stepMs={90}
            >
              {capabilities.items.map((item) => (
                <li
                  key={item.title}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm ring-1 ring-black/[0.02] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg dark:ring-white/[0.04] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-border/60 bg-muted/40">
                    <Image
                      src={landingImageSrc(locale, item.image)}
                      alt={item.title}
                      width={LANDING_IMAGE_SIZES[item.image].width}
                      height={LANDING_IMAGE_SIZES[item.image].height}
                      sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
                      className={cn('size-full object-cover', IMAGE_CROP[item.image] ?? 'object-top')}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-5 text-start">
                    <h3 className="text-base font-bold text-foreground sm:text-lg">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </li>
              ))}
            </LandingStagger>

            {/* Built for Israel */}
            <LandingReveal variant="fade-up" className="mt-12">
              <div className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-card/90 px-6 py-6 text-center shadow-sm dark:bg-card/40 sm:px-8">
                <h3 className="text-base font-bold text-foreground sm:text-lg">{israel.title}</h3>
                <ul className="mt-4 flex list-none flex-wrap items-center justify-center gap-2.5">
                  {israel.items.map((item) => (
                    <li
                      key={item}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground/90 sm:text-sm"
                    >
                      <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden strokeWidth={3} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </LandingReveal>
          </div>
        </SectionShell>

        {/* Trust — automation with a seatbelt */}
        <SectionShell>
          <div className="mx-auto max-w-5xl">
            <SectionTitle title={trust.title} />
            <LandingStagger
              as="ul"
              className="mt-10 grid list-none gap-4 sm:grid-cols-2 sm:gap-5"
              stepMs={100}
            >
              {trust.items.map((item, index) => {
                const Icon = TRUST_ICONS[index] ?? ShieldCheck
                return (
                  <li
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-border/60 bg-card/90 p-5 text-start shadow-sm ring-1 ring-black/[0.02] dark:bg-card/40 dark:ring-white/[0.04]"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 ring-1 ring-teal-500/10 dark:text-teal-300">
                      <Icon className="size-[1.15rem]" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-foreground">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    </div>
                  </li>
                )
              })}
            </LandingStagger>
          </div>
        </SectionShell>

        {/* Audience */}
        <SectionShell className="bg-muted/[0.35]">
          <div className="relative mx-auto max-w-5xl">
            <LandingReveal variant="zoom" className="text-center">
              <h2 className="mx-auto max-w-[34rem] text-balance text-pretty text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                {audience.title}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
                {audience.subtitle}
              </p>
            </LandingReveal>
            <LandingStagger
              className="mt-10 grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8"
              stepMs={140}
            >
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-500/45 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card p-6 shadow-lg shadow-emerald-500/[0.07] ring-1 ring-emerald-500/15 dark:from-emerald-500/[0.11] sm:p-8">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-400 opacity-95"
                  aria-hidden
                />
                <h3 className="relative flex items-center gap-1.5 text-base font-bold leading-none text-foreground sm:text-lg">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                    <Check className="size-3.5" aria-hidden strokeWidth={2.5} />
                  </span>
                  {audience.forTitle}
                </h3>
                <ul className="relative mt-4 flex flex-1 flex-col gap-1 text-pretty text-sm leading-snug text-foreground/92 sm:gap-1.5 sm:text-[0.95rem]">
                  {audience.forBullets.map((line) => (
                    <li key={line} className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-1">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        <Check className="size-2.5" aria-hidden strokeWidth={3} />
                      </span>
                      <span className="min-w-0 pt-0.5">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/55 bg-gradient-to-br from-background via-card to-muted/25 p-6 ring-1 ring-border/35 sm:p-8">
                <h3 className="flex items-center gap-1.5 text-base font-bold leading-none text-foreground sm:text-lg">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/65 bg-background/90 text-foreground/50 shadow-sm">
                    <X className="size-3.5" aria-hidden strokeWidth={2.5} />
                  </span>
                  {audience.notForTitle}
                </h3>
                <ul className="mt-4 flex flex-1 flex-col gap-1 text-pretty text-sm leading-snug text-foreground/80 sm:gap-1.5 sm:text-[0.95rem]">
                  {audience.notForBullets.map((line) => (
                    <li key={line} className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-1">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/30 text-foreground/40">
                        <X className="size-2.5" aria-hidden strokeWidth={2.75} />
                      </span>
                      <span className="min-w-0 pt-0.5">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </LandingStagger>
            <LandingReveal variant="fade-up" className="mx-auto mt-6 max-w-2xl sm:mt-7" threshold={0.15}>
              <p className="text-pretty rounded-2xl border border-border/55 bg-background/85 px-5 py-4 text-center text-sm font-semibold leading-relaxed text-foreground shadow-sm sm:px-6 sm:text-base">
                {audience.closing}
              </p>
            </LandingReveal>
          </div>
        </SectionShell>

        {/* Pricing — after the qualifying section, before the FAQ */}
        {pricingRows.length > 0 ? (
          <SectionShell id="pricing">
            <LandingReveal variant="fade-up">
              <LandingPricing
                copy={pricing}
                rows={pricingRows}
                locale={locale}
                signupHref={links.signup}
              />
            </LandingReveal>
          </SectionShell>
        ) : null}

        {/* FAQ */}
        <SectionShell id="faq" className="bg-muted/[0.35]">
          <LandingReveal variant="blur" className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm ring-1 ring-black/[0.02] dark:bg-card/50 dark:ring-white/[0.04] sm:p-8">
              <h2 className="text-balance text-pretty text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl">
                {faq.title}
              </h2>
              <LandingFaqAccordion items={faq.items} dir={dir} />
            </div>
          </LandingReveal>
        </SectionShell>

        {/* Final CTA */}
        <SectionShell>
          <LandingReveal variant="zoom" className="mx-auto max-w-3xl">
            <div className="rounded-3xl bg-foreground px-6 py-12 text-center text-background shadow-xl sm:px-12 sm:py-14">
              <h2 className="text-balance text-pretty text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {finalCta.title}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed opacity-80 sm:text-base">
                {finalCta.body}
              </p>
              <div className="mt-8 flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  className="h-12 min-h-12 w-full max-w-xs border-0 bg-background px-7 text-base font-semibold text-foreground shadow-md transition-transform duration-300 hover:scale-[1.02] hover:bg-background active:scale-[0.98] motion-reduce:hover:scale-100 sm:w-auto"
                  asChild
                >
                  <Link href={links.signup} data-cta="final-cta">
                    {finalCta.cta}
                  </Link>
                </Button>
                <p className="text-xs opacity-70">{finalCta.note}</p>
              </div>
            </div>
          </LandingReveal>
        </SectionShell>
      </main>

      <footer className="relative z-10 mt-auto border-t border-border/60 bg-background/80 py-8 pb-24 backdrop-blur-sm sm:py-10 sm:pb-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 text-center sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2">
              <span
                className="flex size-2 shrink-0 animate-pulse rounded-full bg-emerald-500/90 shadow-[0_0_10px_rgba(16,185,129,0.35)] motion-reduce:animate-none"
                aria-hidden
              />
              <span className="text-xs font-medium text-muted-foreground">{footer.statusLabel}</span>
            </div>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground/75">
              {footer.domain}
            </span>
          </div>

          <nav
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm"
            aria-label={footer.legalNavLabel}
          >
            <Link
              href="/privacy"
              className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {footer.privacy}
            </Link>
            <span className="text-muted-foreground/35" aria-hidden>
              ·
            </span>
            <Link
              href="/terms"
              className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {footer.terms}
            </Link>
            <span className="text-muted-foreground/35" aria-hidden>
              ·
            </span>
            <Link
              href="/data-deletion"
              className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {footer.dataDeletion}
            </Link>
          </nav>

          {siteContact.address ? (
            <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground sm:text-sm">
              <span className="font-semibold text-foreground/80">{footer.addressLabel}: </span>
              {siteContact.address}
            </p>
          ) : null}

          {siteContact.supportEmail ? (
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="font-semibold text-foreground/80">{footer.supportLabel}: </span>
              <a
                href={`mailto:${siteContact.supportEmail}`}
                className="font-medium text-teal-700 underline-offset-4 transition-colors hover:underline dark:text-teal-400"
              >
                {siteContact.supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      </footer>

      <LandingStickyCta href={links.signup} label={hero.ctaPrimary} note={pricing.trialNote} />
      <LandingCtaTracker />
    </div>
  )
}
