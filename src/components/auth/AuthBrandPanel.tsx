import Link from 'next/link'

import { Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/**
 * The panel a tutor sees before she has an account.
 *
 * It used to carry three self-congratulatory chips (Simple / Fast / Focused),
 * a tagline that listed the same four features shown right below it, and a
 * "System live" status pill. Four of those lines began with "Smart". What is
 * left says what the product does for her, once.
 */
export async function AuthBrandPanel() {
  const t = await getTranslations('auth.brand')
  const tNav = await getTranslations('auth.common')
  const featureKeys = ['feature1', 'feature2', 'feature3'] as const

  return (
    <div className="relative hidden w-[min(100%,32rem)] shrink-0 overflow-hidden bg-gradient-to-bl from-slate-950 via-teal-950 to-violet-950 px-10 py-12 text-center lg:flex lg:flex-col lg:justify-center lg:gap-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_50%_at_0%_0%,rgba(251,191,36,0.08),transparent_55%)]"
        aria-hidden
      />

      <Link
        href="/"
        aria-label={tNav('backToHome')}
        className="relative z-10 flex flex-col items-center gap-3 rounded-2xl p-2 -m-2 outline-none ring-offset-2 ring-offset-slate-950 transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/35"
      >
        <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
          <span className="text-lg font-bold leading-none text-white">L</span>
        </div>
        <div className="space-y-1">
          <span className="block text-lg font-semibold tracking-tight text-white">LESSIO</span>
          <span className="text-xs font-medium text-white/55">{t('subtitle')}</span>
        </div>
      </Link>

      <div className="relative z-10 flex flex-col gap-8">
        <p className="mx-auto max-w-[22rem] text-balance text-pretty text-lg font-semibold leading-snug tracking-tight text-white">
          {t('tagline')}
        </p>

        <ul className="mx-auto grid w-full max-w-[24rem] gap-3">
          {featureKeys.map((key) => (
            <li key={key} className="flex items-center gap-3 text-start">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20"
                aria-hidden
              >
                <Check className="size-3 text-emerald-400" strokeWidth={3} />
              </span>
              <span className="text-sm leading-snug text-white/85">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
