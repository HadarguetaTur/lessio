import type { ReactNode } from 'react'

import { AuthBackHomeBar } from '@/components/auth/AuthBackHomeBar'

/**
 * No decorative shapes behind the form: four rotated pastel squares floating
 * around a sign-in box are the house style of every template, and they compete
 * with the one thing on the screen that matters.
 */
export async function AuthFormShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:min-h-screen">
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain animate-in fade-in-0 slide-in-from-bottom-2 duration-500 max-lg:items-center max-lg:justify-start max-lg:pb-[max(2.25rem,calc(env(safe-area-inset-bottom,0px)+2rem))] lg:items-center lg:justify-start lg:pt-12 lg:pb-10"
      >
        <AuthBackHomeBar />
        {children}
      </div>
    </div>
  )
}
