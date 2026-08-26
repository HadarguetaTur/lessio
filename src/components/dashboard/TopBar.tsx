'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher'
import { GlobalSearch } from '@/components/dashboard/GlobalSearch'
import { resolveBreadcrumb } from '@/lib/navigation/registry'
import type { SaasFeatures } from '@/lib/saas/types'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface TopBarProps {
  currentLocale: string
  userRole: string
  /** Undefined = show everything, matching the sidebar's semantics. */
  saasFeatures?: SaasFeatures
  mobileNavigation?: ReactNode
  notificationBell?: ReactNode
}

export function TopBar({ currentLocale, userRole, saasFeatures, mobileNavigation, notificationBell }: TopBarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { sectionKey, sectionHref, pageKey } = resolveBreadcrumb(pathname)
  const section = sectionKey ? t(sectionKey as Parameters<typeof t>[0]) : null
  const page = pageKey ? t(pageKey as Parameters<typeof t>[0]) : (pathname.split('/').pop() ?? '')

  return (
    <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {mobileNavigation && (
          <Sheet key={pathname}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                aria-label={t('openNavigation')}
              >
                <Menu size={16} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={currentLocale === 'he' ? 'right' : 'left'}
              className="w-[280px] p-0 sm:max-w-[280px]"
              closeAriaLabel={tc('actions.close')}
              closeButtonClassName="text-sidebar-primary hover:bg-sidebar-accent hover:text-sidebar-primary-foreground"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{page}</SheetTitle>
                <SheetDescription>{t('drawerDescription')}</SheetDescription>
              </SheetHeader>
              {mobileNavigation}
            </SheetContent>
          </Sheet>
        )}

        <div className="min-w-0">
          <div className="hidden items-center gap-2 text-sm sm:flex">
            {section && (
              <>
                {/* The ancestor is a link. It rendered as dead text before, and
                    the audit clicked it expecting to reach the section hub. */}
                {sectionHref ? (
                  <Link
                    href={sectionHref}
                    className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    {section}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{section}</span>
                )}
                <ChevronBreadcrumb />
              </>
            )}
            <span className="font-medium text-foreground">{page}</span>
          </div>
          <div className="truncate text-sm font-medium text-foreground sm:hidden">
            {page}
          </div>
        </div>
      </div>

      <GlobalSearch
        userRole={userRole}
        saasFeatures={saasFeatures}
        className="hidden min-w-0 max-w-xl flex-1 md:block"
      />

      <div className="flex shrink-0 items-center gap-2">
        {notificationBell}
        <LocaleSwitcher currentLocale={currentLocale} />
      </div>
    </div>
  )
}

function ChevronBreadcrumb() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground/40 rotate-180">
      <path d="M5.5 3.5L9 7L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
