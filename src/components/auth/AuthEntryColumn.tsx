import type { ReactNode } from 'react'

import Link from 'next/link'

import { getTranslations } from 'next-intl/server'

type CardAlign = 'start' | 'center'

/**
 * Shared layout for auth entry pages (login, signup, forgot-password).
 */
export async function AuthEntryColumn({
  title,
  card,
  cardAlign = 'start',
  afterCard,
  footer,
}: {
  title: string
  card: ReactNode
  cardAlign?: CardAlign
  afterCard?: ReactNode
  footer?: ReactNode
}) {
  const tNav = await getTranslations('auth.common')
  const cardText =
    cardAlign === 'center' ? 'text-center' : 'text-center lg:text-start'

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:max-w-lg sm:px-8 sm:py-12 lg:max-w-lg lg:px-10 lg:py-14 max-lg:pb-2 max-lg:pt-4">
      <Link
        href="/"
        aria-label={tNav('backToHome')}
        className="mb-8 flex flex-col items-center gap-3 rounded-2xl p-2 -m-2 outline-none ring-offset-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-lg shadow-violet-500/25 ring-4 ring-violet-500/[0.08]">
          <span className="text-xl font-bold leading-none text-white">L</span>
        </div>
        <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground">LESSIO</p>
      </Link>

      {/* "Secure" and "SSL" badges removed: announcing that a login form uses
          HTTPS is the kind of reassurance that reads as protesting too much. */}
      <header className="mb-8 w-full max-w-[20rem] text-center sm:max-w-none lg:text-start">
        <h1 className="text-balance text-pretty text-3xl font-bold tracking-tight text-foreground sm:text-[2.125rem] sm:leading-tight">
          {title}
        </h1>
      </header>

      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-7 shadow-[0_24px_64px_-28px_rgba(15,23,42,0.14),0_16px_48px_-28px_rgba(124,58,237,0.1)] ring-1 ring-black/[0.03] backdrop-blur-sm dark:ring-white/[0.06] sm:p-8 ${cardText}`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-teal-600/50 via-violet-500/55 to-amber-400/45"
          aria-hidden
        />
        <div className="relative pt-1">{card}</div>
      </div>

      {afterCard}

      {footer != null ? (
        <div className="w-full text-center lg:text-start">{footer}</div>
      ) : null}
    </div>
  )
}
