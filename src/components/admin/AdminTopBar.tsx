'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, Menu, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { resolveAdminBreadcrumb } from '@/lib/navigation/adminRegistry'
import type { PlatformCapability } from '@/lib/superadmin/capabilities'

/**
 * Breadcrumb, search and the mobile drawer trigger.
 *
 * Per /docs/sprint-34-scope.md § A. The M1 admin shell had no top bar at all,
 * so a detail page like /admin/orgs/<id> gave no clue where it sat. Mirrors
 * src/components/dashboard/TopBar.tsx down to the shell classes.
 */
export function AdminTopBar({
  capabilities,
  dir,
  mobileNavigation,
}: {
  capabilities: readonly PlatformCapability[]
  dir: 'rtl' | 'ltr'
  mobileNavigation: React.ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('admin.nav')
  const { sectionKey, sectionHref, pageKey } = resolveAdminBreadcrumb(pathname, capabilities)

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <div className="lg:hidden">
          {/* Keyed by pathname so the drawer closes itself on navigation. */}
          <Sheet key={pathname}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('openNavigation')}>
                <Menu size={16} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={dir === 'rtl' ? 'right' : 'left'}
              className="w-[280px] p-0 sm:max-w-[280px]"
              showCloseButton={false}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{t('title')}</SheetTitle>
                <SheetDescription>{t('searchPlaceholder')}</SheetDescription>
              </SheetHeader>
              {mobileNavigation}
            </SheetContent>
          </Sheet>
        </div>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          {sectionKey && (
            <>
              {sectionHref ? (
                <Link
                  href={sectionHref}
                  className="hidden shrink-0 text-muted-foreground transition-colors hover:text-foreground sm:inline"
                >
                  {t(sectionKey)}
                </Link>
              ) : (
                <span className="hidden shrink-0 text-muted-foreground sm:inline">
                  {t(sectionKey)}
                </span>
              )}
              <ChevronLeft
                size={13}
                aria-hidden
                className="hidden shrink-0 text-muted-foreground/60 sm:inline ltr:rotate-180"
              />
            </>
          )}
          <span className="truncate font-medium text-foreground">
            {pageKey ? t(pageKey) : t('title')}
          </span>
        </nav>
      </div>

      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('admin:open-command-palette'))}
        className="flex shrink-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search size={14} />
        <span className="hidden sm:inline">{t('searchPlaceholder')}</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>
    </header>
  )
}
