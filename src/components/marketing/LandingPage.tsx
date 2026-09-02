import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarX,
  Check,
  GitBranch,
  LayoutDashboard,
  MessageCircle,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'

import { AuthPageDecorations } from '@/components/auth/AuthPageDecorations'
import { LandingFaqAccordion } from '@/components/marketing/LandingFaqAccordion'
import { LandingLocaleToggle } from '@/components/marketing/LandingLocaleToggle'
import { LandingPricing } from '@/components/marketing/LandingPricing'
import { LandingProcessSteps } from '@/components/marketing/LandingProcessSteps'
import { LandingReveal } from '@/components/marketing/LandingReveal'
import { LandingStagger } from '@/components/marketing/LandingStagger'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PublicPricingRow } from '@/lib/marketing/publicPricing'
import type { LandingContent } from '@/lib/marketing/landingCopy'
import type { SiteContact } from '@/lib/marketing/siteContact'

const STATE_ICONS = [Wallet, CalendarX, LayoutDashboard, MessageCircle] as const
/** Solution pillars: real ops → WhatsApp → one place / control */
const PILLAR_ICONS = [GitBranch, MessageCircle, LayoutDashboard] as const

const HERO_MOTION =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-both motion-reduce:animate-none'

function CtaLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const external = href.startsWith('http://') || href.startsWith('https://')
  if (external) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      size="lg"
      className="h-12 min-h-12 w-full min-w-[11rem] border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-7 text-base font-semibold text-white shadow-md shadow-teal-600/15 transition-[filter,box-shadow,transform] duration-300 hover:scale-[1.03] hover:brightness-[1.03] hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100 sm:w-auto"
      asChild
    >
      <CtaLink href={href}>{children}</CtaLink>
    </Button>
  )
}

function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      variant="outline"
      size="lg"
      className="h-12 min-h-12 w-full min-w-[11rem] border-border/90 bg-background/80 px-7 text-base font-semibold shadow-sm backdrop-blur-sm transition-[transform,box-shadow,background-color] duration-300 hover:scale-[1.03] hover:bg-background hover:shadow-md active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100 sm:w-auto"
      asChild
    >
      <CtaLink href={href}>{children}</CtaLink>
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
        'border-t border-border/50 px-4 py-12 sm:px-6 md:py-16 lg:px-8 lg:py-20',
        className
      )}
    >
      {children}
    </section>
  )
}

function ContentCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm ring-1 ring-black/[0.02] backdrop-blur-sm transition-[box-shadow,transform,border-color] duration-500 hover:border-primary/10 hover:shadow-md dark:bg-card/50 dark:ring-white/[0.04] sm:p-8 md:p-9',
        className
      )}
    >
      {children}
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
    problem,
    currentState,
    solution,
    businessValue,
    audience,
    pricing,
    faq,
    footer,
    links,
    nav,
  } = content

  const showHeroHighlights = hero.highlights.length > 0

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-y-auto overflow-x-hidden bg-background"
      dir={dir}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.65] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000 motion-safe:ease-out motion-safe:fill-mode-both"
        aria-hidden
      >
        <AuthPageDecorations />
      </div>

      {/* Extra soft motion layers */}
      <div
        className="pointer-events-none absolute start-[4%] top-[22%] size-32 rounded-full bg-teal-400/10 blur-3xl motion-safe:animate-pulse motion-safe:duration-[6000ms] motion-reduce:animate-none"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute end-[6%] top-[38%] size-40 rounded-full bg-violet-400/10 blur-3xl motion-safe:animate-pulse motion-safe:delay-1000 motion-safe:duration-[7000ms] motion-reduce:animate-none"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[12%] start-[20%] size-24 rounded-full bg-emerald-400/8 blur-2xl motion-safe:animate-pulse motion-safe:delay-500 motion-safe:duration-[5500ms] motion-reduce:animate-none"
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-3 motion-safe:duration-500 motion-safe:ease-out motion-safe:fill-mode-both motion-reduce:animate-none">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-sm shadow-violet-500/15 ring-1 ring-violet-500/10 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-600 motion-safe:delay-75 motion-reduce:animate-none">
              <span className="text-sm font-bold leading-none text-white">L</span>
            </div>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:delay-150 motion-safe:duration-500 motion-reduce:animate-none">
              LESSIO
            </span>
          </div>
          <nav
            className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-500 motion-safe:delay-200 motion-reduce:animate-none"
            aria-label="Primary"
          >
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
              className="h-9 border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-3 text-xs font-semibold text-white shadow-sm shadow-teal-600/15 transition-[filter,transform] duration-300 hover:scale-[1.05] hover:brightness-[1.03] motion-reduce:hover:scale-100 sm:text-sm"
              asChild
            >
              <Link href={links.signup}>{nav.signup}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative px-4 pb-14 pt-10 sm:px-6 sm:pb-16 sm:pt-14 md:pt-16 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center sm:top-24">
            <div
              className="h-52 w-[min(100%,44rem)] rounded-[100%] bg-gradient-to-r from-teal-500/14 via-violet-500/12 to-emerald-500/12 blur-3xl motion-safe:animate-pulse motion-safe:duration-[8000ms] motion-reduce:animate-none"
              aria-hidden
            />
          </div>
          <div className="relative mx-auto max-w-3xl text-center">
            {showHeroHighlights ? (
              <LandingStagger
                className="mx-auto mb-7 flex flex-wrap items-center justify-center gap-2"
                stepMs={100}
                threshold={0.05}
                rootMargin="0px 0px 0px 0px"
              >
                {hero.highlights.map((label) => (
                  <span
                    key={label}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-foreground/90 shadow-sm backdrop-blur-sm sm:text-sm',
                      'motion-safe:transition-transform motion-safe:duration-300 hover:scale-105 motion-reduce:hover:scale-100'
                    )}
                  >
                    <Sparkles
                      className="size-3.5 shrink-0 text-teal-600/90 dark:text-teal-400/90 motion-safe:animate-pulse motion-reduce:animate-none"
                      aria-hidden
                    />
                    {label}
                  </span>
                ))}
              </LandingStagger>
            ) : null}

            <h1
              className={cn(
                'text-balance text-pretty text-[1.85rem] font-bold leading-[1.14] tracking-tight text-foreground sm:text-4xl sm:leading-[1.1] md:text-[2.5rem]',
                HERO_MOTION,
                'motion-safe:delay-75 motion-safe:blur-in'
              )}
            >
              {hero.headline}
            </h1>
            <p
              className={cn(
                'mx-auto mt-5 max-w-2xl text-pretty text-base font-medium leading-snug text-foreground/90 sm:text-lg md:text-xl',
                HERO_MOTION,
                'motion-safe:delay-150'
              )}
            >
              {hero.subheadline}
            </p>
            {hero.supporting.length > 0 ? (
              <div
                className={cn(
                  'mx-auto mt-8 max-w-2xl space-y-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base',
                  HERO_MOTION,
                  'motion-safe:delay-200'
                )}
              >
                {hero.supporting.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ) : null}

            <div
              className={cn(
                'mx-auto mt-10 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4',
                HERO_MOTION,
                'motion-safe:delay-300 motion-safe:zoom-in-95'
              )}
            >
              <PrimaryCta href={links.signup}>{hero.ctaPrimary}</PrimaryCta>
              <SecondaryCta href={links.login}>{hero.ctaLogin}</SecondaryCta>
            </div>

            <div
              className="mt-8 flex justify-center gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:delay-500 motion-safe:fill-mode-both motion-reduce:animate-none"
              aria-hidden
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-teal-500/45 motion-safe:animate-bounce motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 140}ms`, animationDuration: '1.4s' }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Solution — copy from landingCopy.solution; anchor for QA */}
        <SectionShell id="why-lessio" className="bg-muted/[0.35]">
          <div className="mx-auto max-w-5xl">
            <LandingReveal variant="blur" className="mx-auto max-w-3xl text-center">
              <h2 className="text-balance text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                {solution.title}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-foreground/85 sm:text-base">
                {solution.intro}
              </p>
            </LandingReveal>
            <LandingStagger
              as="ul"
              className="mt-10 grid list-none gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5"
              stepMs={95}
            >
              {solution.pillars.map((pillar, index) => {
                const Icon = PILLAR_ICONS[index] ?? Sparkles
                return (
                  <li
                    key={pillar.title}
                    className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm ring-1 ring-black/[0.02] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-teal-500/30 hover:shadow-lg hover:shadow-teal-500/10 dark:bg-card/40 dark:ring-white/[0.04] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
                  >
                    <div className="relative flex gap-3.5 text-start sm:gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/15 to-violet-500/15 text-teal-700 ring-1 ring-teal-500/10 dark:text-teal-300">
                        <Icon className="size-[1.15rem]" aria-hidden />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-foreground sm:text-lg">{pillar.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85 sm:text-[0.95rem]">
                          {pillar.body}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </LandingStagger>
          </div>
        </SectionShell>

        {/* Problem */}
        <SectionShell className="bg-muted/[0.35]">
          <LandingReveal variant="zoom" className="mx-auto max-w-3xl">
            <ContentCard>
              <LandingReveal variant="blur" threshold={0.08} rootMargin="0px 0px -4% 0px">
                <h2 className="text-balance text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                  {problem.title}
                </h2>
              </LandingReveal>
              <LandingProcessSteps steps={problem.processSteps} dir={dir} />
            </ContentCard>
          </LandingReveal>
        </SectionShell>

        {/* Current state */}
        <SectionShell>
          <div className="mx-auto max-w-5xl">
            <LandingReveal variant="zoom" className="text-center">
              <h2 className="text-balance text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                {currentState.title}
              </h2>
            </LandingReveal>
            <LandingStagger
              as="ul"
              className="mt-10 grid list-none gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-5"
              stepMs={90}
            >
              {currentState.items.map((item, index) => {
                const Icon = STATE_ICONS[index] ?? Sparkles
                return (
                  <li
                    key={item.title}
                    className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm ring-1 ring-black/[0.02] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-rose-500/20 hover:shadow-lg hover:shadow-rose-500/10 dark:bg-card/40 dark:ring-white/[0.04] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
                  >
                    <div
                      className="pointer-events-none absolute -end-6 -top-6 size-24 rounded-full bg-gradient-to-br from-rose-500/10 to-violet-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100 motion-reduce:opacity-0"
                      aria-hidden
                    />
                    <div className="relative flex flex-col gap-2.5 text-start">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/12 to-violet-500/12 text-rose-700 ring-1 ring-rose-500/10 dark:text-rose-300">
                        <Icon className="size-[1.15rem]" aria-hidden />
                      </span>
                      <h3 className="text-base font-semibold text-foreground sm:text-lg">{item.title}</h3>
                      <p className="text-sm leading-relaxed text-foreground/85 sm:text-[0.95rem] sm:leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  </li>
                )
              })}
            </LandingStagger>
          </div>
        </SectionShell>

        {/* Business value */}
        <SectionShell>
          <LandingReveal variant="from-start" className="mx-auto max-w-3xl">
            <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm ring-1 ring-black/[0.02] backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-teal-500/25 hover:shadow-md hover:shadow-teal-500/10 dark:bg-card/40 dark:ring-white/[0.04] motion-reduce:transition-none motion-reduce:hover:border-border/60 motion-reduce:hover:shadow-sm sm:p-8 md:p-9">
              <div
                className="pointer-events-none absolute -end-10 -top-14 size-44 rounded-full bg-gradient-to-br from-teal-500/18 to-violet-500/14 opacity-90 blur-3xl transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-16 -start-10 size-36 rounded-full bg-gradient-to-tr from-emerald-500/10 to-teal-500/8 blur-3xl"
                aria-hidden
              />
              <div className="relative text-start">
                <h2 className="text-balance text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                  {businessValue.title}
                </h2>
                <div className="mt-6 space-y-4 border-t border-border/50 pt-6 text-sm leading-relaxed text-foreground/85 sm:mt-7 sm:space-y-4 sm:pt-7 sm:text-base">
                  {businessValue.paragraphs.map((p) => (
                    <p key={p} className="text-pretty">
                      {p}
                    </p>
                  ))}
                </div>
                <LandingStagger
                  className="mt-8 flex flex-col gap-2.5 border-t border-border/50 pt-8 sm:mt-9 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3 sm:pt-9"
                  stepMs={120}
                >
                  {businessValue.stats.map((stat) => (
                    <div
                      key={stat}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-background/75 px-3.5 py-2 text-center text-xs font-semibold text-foreground/90 shadow-sm backdrop-blur-sm sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
                    >
                      <Sparkles
                        className="size-3.5 shrink-0 text-teal-600/85 dark:text-teal-400/85"
                        aria-hidden
                      />
                      <span className="text-pretty leading-snug">{stat}</span>
                    </div>
                  ))}
                </LandingStagger>
              </div>
            </div>
          </LandingReveal>
        </SectionShell>

        {/* Audience */}
        <SectionShell className="relative overflow-hidden bg-gradient-to-b from-muted/[0.45] via-muted/[0.28] to-muted/[0.38]">
          <div
            className="pointer-events-none absolute -end-24 -top-28 size-[22rem] rounded-full bg-emerald-500/[0.09] blur-3xl dark:bg-emerald-500/[0.12]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-36 -start-20 size-[24rem] rounded-full bg-violet-500/[0.06] blur-3xl dark:bg-violet-500/[0.08]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-5xl">
            <LandingReveal variant="zoom" className="text-center">
              <h2 className="mx-auto max-w-[34rem] text-balance text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl md:leading-tight">
                {audience.title}
              </h2>
            </LandingReveal>
            <LandingStagger
              className="mt-10 grid gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-8"
              stepMs={140}
            >
              <ContentCard className="group relative flex h-full flex-col overflow-hidden border-emerald-500/45 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card shadow-lg shadow-emerald-500/[0.07] ring-1 ring-emerald-500/15 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-emerald-500/55 hover:shadow-xl hover:shadow-emerald-500/12 motion-reduce:hover:translate-y-0 dark:from-emerald-500/[0.11] dark:via-card dark:to-card dark:shadow-emerald-950/30 dark:ring-emerald-400/20">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-400 opacity-95 dark:opacity-90"
                  aria-hidden
                />
                <h3 className="relative flex items-center gap-1.5 text-base font-semibold leading-none text-foreground sm:text-lg">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-500/20 dark:bg-emerald-500/18 dark:text-emerald-300 dark:ring-emerald-400/25">
                    <Check className="size-3.5" aria-hidden strokeWidth={2.5} />
                  </span>
                  {audience.forTitle}
                </h3>
                <ul className="relative mt-4 flex flex-1 flex-col gap-1 text-pretty text-sm leading-snug text-foreground/92 sm:gap-1.5 sm:text-[0.95rem] sm:leading-snug">
                  {audience.forBullets.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-1 transition-[background-color] duration-200 hover:bg-emerald-500/[0.08] dark:hover:bg-emerald-500/[0.12]"
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        <Check className="size-2.5" aria-hidden strokeWidth={3} />
                      </span>
                      <span className="min-w-0 pt-0.5">{line}</span>
                    </li>
                  ))}
                </ul>
              </ContentCard>
              <ContentCard className="group flex h-full flex-col overflow-hidden border-border/55 bg-gradient-to-br from-background via-card to-muted/25 ring-1 ring-border/35 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-border/75 hover:shadow-md motion-reduce:hover:translate-y-0 dark:from-background dark:via-card/95 dark:to-muted/15 dark:ring-border/25">
                <h3 className="flex items-center gap-1.5 text-base font-semibold leading-none text-foreground sm:text-lg">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/65 bg-background/90 text-foreground/50 shadow-sm dark:border-border/50 dark:bg-background/50 dark:text-foreground/55">
                    <X className="size-3.5" aria-hidden strokeWidth={2.5} />
                  </span>
                  {audience.notForTitle}
                </h3>
                <ul className="mt-4 flex flex-1 flex-col gap-1 text-pretty text-sm leading-snug text-foreground/80 sm:gap-1.5 sm:text-[0.95rem] sm:leading-snug">
                  {audience.notForBullets.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 rounded-xl px-2 py-1.5 -mx-1 transition-[background-color] duration-200 hover:bg-muted/40 dark:hover:bg-muted/25"
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/30 text-foreground/40 dark:border-border/40 dark:bg-muted/20 dark:text-foreground/45">
                        <X className="size-2.5" aria-hidden strokeWidth={2.75} />
                      </span>
                      <span className="min-w-0 pt-0.5">{line}</span>
                    </li>
                  ))}
                </ul>
              </ContentCard>
            </LandingStagger>
            <LandingReveal variant="fade-up" className="mx-auto mt-6 max-w-2xl sm:mt-7" threshold={0.15}>
              <p className="text-pretty rounded-2xl border border-border/55 bg-background/85 px-5 py-4 text-center text-sm font-semibold leading-relaxed text-foreground shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:bg-background/55 dark:ring-white/[0.04] sm:px-6 sm:text-base sm:leading-relaxed">
                {audience.closing}
              </p>
            </LandingReveal>
          </div>
        </SectionShell>

        {/* Pricing — after the qualifying "who it's for" section, before the
            FAQ that answers the objections a price raises. */}
        {pricingRows.length > 0 ? (
          <SectionShell id="pricing" className="bg-muted/[0.35]">
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
        <SectionShell>
          <LandingReveal variant="blur" className="mx-auto max-w-3xl">
            <ContentCard>
              <h2 className="text-balance text-pretty text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl md:text-2xl">
                {faq.title}
              </h2>
              <LandingFaqAccordion items={faq.items} dir={dir} />
            </ContentCard>
          </LandingReveal>
        </SectionShell>

        <footer className="relative z-10 mt-auto border-t border-border/60 bg-background/80 py-8 backdrop-blur-sm sm:py-10">
          <LandingReveal
            variant="fade-up"
            className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 text-center sm:px-6 lg:px-8"
          >
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-2 shrink-0 animate-pulse rounded-full bg-emerald-500/90 shadow-[0_0_10px_rgba(16,185,129,0.35)] motion-reduce:animate-none"
                  aria-hidden
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {footer.statusLabel}
                </span>
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
                className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-violet-600 hover:underline dark:hover:text-violet-400"
              >
                {footer.privacy}
              </Link>
              <span className="text-muted-foreground/35" aria-hidden>
                ·
              </span>
              <Link
                href="/terms"
                className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-violet-600 hover:underline dark:hover:text-violet-400"
              >
                {footer.terms}
              </Link>
              <span className="text-muted-foreground/35" aria-hidden>
                ·
              </span>
              <Link
                href="/data-deletion"
                className="font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-violet-600 hover:underline dark:hover:text-violet-400"
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
                  className="font-medium text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
                >
                  {siteContact.supportEmail}
                </a>
              </p>
            ) : null}
          </LandingReveal>
        </footer>
      </main>
    </div>
  )
}
