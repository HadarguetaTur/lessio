import Link from 'next/link'

import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'

import { AuthPageDecorations } from '@/components/auth/AuthPageDecorations'
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getTranslations()
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  const tNav = await getTranslations('auth.common')

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background" dir={dir}>
      <AuthPageDecorations />

      <header className="relative z-20 shrink-0 border-b border-border/60 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label={tNav('backToHome')}
              className="flex min-w-0 items-center gap-3 rounded-xl p-1 -m-1 outline-none ring-offset-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-md shadow-violet-500/20 ring-2 ring-violet-500/15">
                <span className="text-sm font-bold leading-none text-white">L</span>
              </div>
              <div className="min-w-0">
                <span className="block truncate text-base font-semibold tracking-tight text-foreground">
                  LESSIO
                </span>
                <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">
                  {t('onboarding.setup')}
                </span>
              </div>
            </Link>
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:text-teal-200">
                <ShieldCheck className="size-3 text-teal-600 dark:text-teal-300" aria-hidden />
                {t('onboarding.secure')}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
            >
              <ArrowLeft className="size-3.5 shrink-0 rtl:rotate-180 sm:size-4" aria-hidden />
              <span className="hidden sm:inline">{tNav('backToHome')}</span>
              <span className="sm:hidden">{tNav('backToHomeShort')}</span>
            </Link>
            <LocaleSwitcher currentLocale={locale} />
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-[max(5rem,calc(env(safe-area-inset-bottom,0px)+3rem))] pt-6 sm:px-8 sm:pb-24 sm:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
