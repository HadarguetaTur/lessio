import Link from 'next/link'

import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export async function AuthBackHomeBar() {
  const t = await getTranslations('auth.common')

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-md justify-start px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:max-w-lg sm:px-8 lg:max-w-lg lg:px-10 lg:pb-2 lg:pt-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-lg py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        {t('backToHome')}
      </Link>
    </div>
  )
}
