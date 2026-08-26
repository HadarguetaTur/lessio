'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher'
import { GlobalSearch } from '@/components/dashboard/GlobalSearch'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

// Maps route paths to nav translation keys
const ROUTE_KEY_MAP: Record<string, string> = {
  '/dashboard':                    'dashboard',
  '/students':                    'students',
  '/parents':                     'parents',
  '/teachers':                    'teachers',
  '/lessons':                     'lessons',
  '/charges':                     'charges',
  '/billing':                     'billing',
  '/billing/debts':               'debts',
  '/subscriptions':               'subscriptions',
  '/leads':                       'leads',
  '/homework':                    'homework',
  '/reports':                     'sections.reports',
  '/reports/revenue':             'reportsRevenue',
  '/reports/lessons':             'reportsLessons',
  '/reports/debt':                'reportsDebt',
  '/reports/teachers':            'reportsTeachers',
  '/reports/students':            'reportsStudents',
  '/settings':                    'sections.settings',
  '/settings/whatsapp':           'settingsWhatsApp',
  '/settings/message-templates':  'settingsMessages',
  '/settings/payment':            'settingsPayment',
  '/settings/receipts':           'settingsReceipts',
  '/settings/cancellation-policy': 'settingsCancellation',
  '/settings/holidays':           'settingsHolidays',
  '/settings/reminders':          'settingsReminders',
  '/settings/ai-assistant':       'settingsAiAssistant',
  '/settings/locale':             'settingsLocale',
  '/teacher/schedule':            'teacherSchedule',
  '/teacher/calendar':            'teacherCalendar',
  '/teacher/new-lesson':          'teacherNewLesson',
  '/teacher/availability':        'teacherAvailability',
  '/teacher/overrides':           'teacherOverrides',
}

const SECTION_KEY_MAP: Record<string, string> = {
  '/reports':  'sections.reports',
  '/settings': 'sections.settings',
  '/teacher':  'sections.teacher',
}

function getBreadcrumbKeys(pathname: string): { sectionKey: string | null; pageKey: string | null } {
  // Exact match
  if (ROUTE_KEY_MAP[pathname]) {
    const sectionEntry = Object.entries(SECTION_KEY_MAP).find(([prefix]) =>
      pathname !== prefix && pathname.startsWith(prefix + '/')
    )
    return {
      sectionKey: sectionEntry ? sectionEntry[1] : null,
      pageKey: ROUTE_KEY_MAP[pathname],
    }
  }

  // Dynamic segments — find closest prefix match
  const parts = pathname.split('/')
  const parentPath = parts.slice(0, -1).join('/') || '/'
  const grandParentPath = parts.slice(0, -2).join('/') || '/'

  const pageKey =
    ROUTE_KEY_MAP[parentPath] ??
    ROUTE_KEY_MAP[grandParentPath] ??
    null

  const sectionEntry = Object.entries(SECTION_KEY_MAP).find(([prefix]) =>
    pathname.startsWith(prefix + '/')
  )

  return { sectionKey: sectionEntry ? sectionEntry[1] : null, pageKey }
}

interface TopBarProps {
  currentLocale: string
  userRole: string
  mobileNavigation?: ReactNode
  notificationBell?: ReactNode
}

export function TopBar({ currentLocale, userRole, mobileNavigation, notificationBell }: TopBarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { sectionKey, pageKey } = getBreadcrumbKeys(pathname)
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
                <span className="text-muted-foreground">{section}</span>
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
