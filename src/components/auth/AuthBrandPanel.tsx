import Link from 'next/link'

import { Check, Sparkles } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export async function AuthBrandPanel() {
  const t = await getTranslations('auth.brand')
  const tNav = await getTranslations('auth.common')
  const featureKeys = ['feature1', 'feature2', 'feature3', 'feature4'] as const
  return (
    <div className="relative hidden w-[min(100%,32rem)] shrink-0 overflow-hidden bg-gradient-to-bl from-slate-950 via-teal-950 to-violet-950 px-10 py-12 text-center lg:flex lg:flex-col lg:justify-start lg:gap-10 lg:pt-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_50%_at_0%_0%,rgba(251,191,36,0.1),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_48%_at_100%_100%,rgba(167,139,250,0.12),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -start-24 top-1/3 size-80 rounded-full bg-teal-400/[0.07] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:44px_44px]"
        aria-hidden
      />

      <Link
        href="/"
        aria-label={tNav('backToHome')}
        className="relative z-10 flex flex-col items-center gap-3 rounded-2xl p-2 pt-3 -m-2 outline-none ring-offset-2 ring-offset-slate-950 transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/35"
      >
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-violet-500/30 shadow-lg shadow-black/25 ring-1 ring-white/15 backdrop-blur-sm">
          <span className="text-lg font-bold leading-none text-white">L</span>
        </div>
        <div className="space-y-1">
          <span className="block text-lg font-semibold tracking-tight text-white">LESSIO</span>
          <span className="text-xs font-medium text-white/45">{t('subtitle')}</span>
        </div>
      </Link>

      <div className="relative z-10 flex min-h-0 flex-col gap-8 lg:my-0">
        <div
          className="mx-auto h-px w-12 bg-gradient-to-l from-transparent via-white/25 to-transparent"
          aria-hidden
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-sm">
            <Sparkles className="size-3.5 shrink-0 text-amber-300/95" aria-hidden />
            {t('simple')}
          </span>
          <span className="rounded-full border border-emerald-400/22 bg-emerald-500/[0.12] px-3 py-1 text-xs font-medium text-emerald-50/95">
            {t('fast')}
          </span>
          <span className="rounded-full border border-violet-400/28 bg-violet-500/[0.14] px-3 py-1 text-xs font-medium text-violet-50/95">
            {t('focused')}
          </span>
        </div>

        <p className="mx-auto max-w-[22rem] text-balance text-pretty text-base font-semibold leading-snug tracking-tight text-white/95 sm:text-[1.0625rem] sm:leading-snug">
          {t('tagline')}
        </p>

        <ul className="mx-auto grid w-full max-w-[26rem] grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2.5">
          {featureKeys.map((key) => (
            <li
              key={key}
              className="flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-start backdrop-blur-sm"
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/18 ring-1 ring-emerald-400/30"
                aria-hidden
              >
                <Check className="size-3.5 text-emerald-400" strokeWidth={2.75} />
              </span>
              <span className="text-[0.8125rem] font-medium leading-snug text-white/[0.94] sm:text-sm">
                {t(key)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-white/[0.08] bg-black/25 px-5 py-3.5 backdrop-blur-sm lg:mt-10">
        <div className="flex items-center gap-2">
          <span className="flex size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
          <span className="text-xs font-medium text-white/72">{t('statusLive')}</span>
        </div>
        <span className="text-xs font-semibold tracking-wide text-white/48">lessio.app</span>
      </div>
    </div>
  )
}
