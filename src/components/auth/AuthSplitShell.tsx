import type { ReactNode } from 'react'

import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { AuthFormShell } from '@/components/auth/AuthFormShell'
import { getLocale } from 'next-intl/server'

export async function AuthSplitShell({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <main className="flex min-h-dvh flex-col lg:min-h-screen lg:flex-row" dir={dir}>
      <AuthBrandPanel />
      <AuthFormShell>{children}</AuthFormShell>
    </main>
  )
}
