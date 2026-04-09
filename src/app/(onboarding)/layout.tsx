import { getLocale } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={dir}>
      {/* Minimal header */}
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="max-w-screen-md mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold leading-none">L</span>
            </div>
            <span className="text-base font-semibold tracking-tight">LESSIO</span>
          </div>
          <LocaleSwitcher currentLocale={locale} />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-6 py-10">
        <div className="w-full max-w-screen-md">
          {children}
        </div>
      </main>
    </div>
  )
}
