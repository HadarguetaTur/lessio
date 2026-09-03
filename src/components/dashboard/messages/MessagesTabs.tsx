'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * Portal messages and WhatsApp conversations are two channels of the same
 * thing — talking to a parent — so they share one page rather than two sidebar
 * rows. Teachers reach only the WhatsApp side, and get no strip at all.
 */
export function MessagesTabs({ showPortal = true }: { showPortal?: boolean }) {
  const t = useTranslations('waConversations')
  const pathname = usePathname()

  if (!showPortal) return null

  const onWhatsApp = pathname.startsWith('/messages/whatsapp')

  return (
    <div className="flex gap-1 border-b border-border">
      <TabLink href="/messages" label={t('tabs.portal')} active={!onWhatsApp} />
      <TabLink href="/messages/whatsapp" label={t('tabs.whatsapp')} active={onWhatsApp} />
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  )
}
