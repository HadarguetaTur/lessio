'use client'

/**
 * Desktop-only launcher for the support panel — Sprint 32.
 *
 * `hidden lg:flex` on purpose: on a phone this used to be a second floating
 * pill competing with the quick-actions pill for the same corner. Mobile opens
 * the panel from a row inside that sheet instead (MobileAdminQuickSheet).
 *
 * Deliberately NOT filled with the primary colour. It is on every dashboard
 * route at 3,895px², which made "ask for help" the most emphasised control on
 * screen — 2.3× the Save button on a form, and the only filled control at all
 * on the parent and teacher pages (UX audit F10). It stays easy to find and
 * stops outranking the action the page is actually for.
 */

import { useTranslations } from 'next-intl'
import { LifeBuoy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSupportPanel } from './SupportPanelProvider'

export function SupportLauncher() {
  const t = useTranslations('support.panel')
  const panel = useSupportPanel()

  if (!panel) return null

  return (
    <button
      type="button"
      onClick={panel.open}
      aria-label={t('launcherAria')}
      className={cn(
        'group fixed bottom-6 end-6 z-30 hidden items-center gap-2 lg:flex',
        'rounded-full bg-card py-3 ps-4 pe-5 text-foreground border border-border',
        'shadow-md ring-1 ring-foreground/5',
        'transition-all hover:bg-muted hover:shadow-lg hover:-translate-y-0.5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      )}
    >
      <LifeBuoy className="size-[18px] transition-transform group-hover:rotate-45" aria-hidden />
      <span className="text-[13px] font-medium">{t('launcher')}</span>
    </button>
  )
}
