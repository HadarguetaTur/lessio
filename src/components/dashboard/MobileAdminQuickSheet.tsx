'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CalendarDays, ChevronUp, PlusCircle, Receipt, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSupportPanel } from '@/components/dashboard/support/SupportPanelProvider'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const LESSONS_DAY = '/lessons?view=day'
const LESSONS_NEW = '/lessons?view=day&openNewLesson=1'
const DEBT = '/reports/debt'

export function MobileAdminQuickSheet() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('nav.mobileQuickMenu')
  const tc = useTranslations('common')
  const tSupport = useTranslations('support.panel')
  // Absent in the support-mode shell, which mounts no provider — a superadmin
  // impersonating an org should not be filing that customer's support tickets.
  const supportPanel = useSupportPanel()

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden',
          'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
        )}
      >
        <div className="pointer-events-auto mx-auto flex max-w-screen-xl justify-center px-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 gap-1.5 rounded-full border border-border bg-background/95 shadow-md backdrop-blur-md"
            onClick={() => setOpen(true)}
            aria-label={t('triggerAria')}
            aria-expanded={open}
          >
            <ChevronUp className="size-4 opacity-70" aria-hidden />
            <span className="text-[13px] font-medium">{t('title')}</span>
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
          closeAriaLabel={tc('actions.close')}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('title')}</SheetTitle>
          </SheetHeader>
          <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
          <nav className="flex flex-col gap-2 pb-2" aria-label={t('title')}>
            <Button variant="outline" className="h-12 justify-start gap-3 text-[15px] font-medium" asChild>
              <Link href={LESSONS_NEW} onClick={() => setOpen(false)} prefetch>
                <PlusCircle className="size-[18px] shrink-0 text-primary" aria-hidden />
                {t('scheduleLesson')}
              </Link>
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-3 text-[15px] font-medium" asChild>
              <Link href={DEBT} onClick={() => setOpen(false)} prefetch>
                <Receipt className="size-[18px] shrink-0 text-primary" aria-hidden />
                {t('openDebt')}
              </Link>
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-3 text-[15px] font-medium" asChild>
              <Link href={LESSONS_DAY} onClick={() => setOpen(false)} prefetch>
                <CalendarDays className="size-[18px] shrink-0 text-primary" aria-hidden />
                {t('dailySchedule')}
              </Link>
            </Button>

            {/*
              Support lives here on mobile rather than as its own floating pill:
              two pills were competing for the bottom of a phone screen. The
              separator marks it as a different kind of action — this one talks
              to us, the rest navigate the product.
            */}
            {supportPanel ? (
              <Button
                variant="outline"
                className="mt-1 h-12 justify-start gap-3 border-dashed text-[15px] font-medium"
                onClick={() => {
                  setOpen(false)
                  supportPanel.open()
                }}
              >
                <LifeBuoy className="size-[18px] shrink-0 text-primary" aria-hidden />
                {tSupport('launcher')}
              </Button>
            ) : null}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
