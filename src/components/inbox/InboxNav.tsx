'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MessageSquare, Users, Megaphone } from 'lucide-react'
import type { LockedFeatureInfo } from '@/lib/whatsapp/capabilities'
import { LockedFeatureTrigger } from '@/components/whatsapp/LockedFeature'

/**
 * The inbox's three places: conversations, lists, broadcasts.
 *
 * A segmented control rather than the old underlined tab strip, because these
 * are three modes of one tool rather than three pages that happen to be
 * adjacent — and because it survives a narrow screen, which the tab strip did
 * not.
 *
 * Teachers see only conversations, so the whole control disappears for them
 * rather than showing a single lonely segment.
 *
 * A segment the org cannot use stays where it is, with a lock. Hiding it made
 * the owner wonder whether the feature existed; sending her to the billing
 * page with no sentence made her guess at Meta policy. The lock opens the
 * explanation instead.
 */

const SEGMENTS = [
  { href: '/messages', key: 'conversations', icon: MessageSquare },
  { href: '/messages/lists', key: 'lists', icon: Users },
  { href: '/messages/broadcasts', key: 'broadcasts', icon: Megaphone },
] as const

type SegmentKey = (typeof SEGMENTS)[number]['key']

export function InboxNav({
  showAll,
  canFix = true,
  locks = {},
}: {
  showAll: boolean
  canFix?: boolean
  /** Verdict per lockable segment; a `locked` one renders as a lock, not a link. */
  locks?: Partial<Record<Exclude<SegmentKey, 'conversations'>, LockedFeatureInfo>>
}) {
  const t = useTranslations('inbox.nav')
  const pathname = usePathname()

  if (!showAll) return null

  /** Conversations owns every /messages route that is not lists or broadcasts. */
  function isActive(href: string): boolean {
    if (href === '/messages') {
      return !pathname.startsWith('/messages/lists') && !pathname.startsWith('/messages/broadcasts')
    }
    return pathname.startsWith(href)
  }

  const segmentClass = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`

  return (
    <nav
      aria-label={t('label')}
      className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1"
    >
      {SEGMENTS.map(({ href, key, icon: Icon }) => {
        const active = isActive(href)
        const lock = key === 'conversations' ? undefined : locks[key]

        if (lock && lock.status === 'locked') {
          return (
            <LockedFeatureTrigger
              key={href}
              info={lock}
              canFix={canFix}
              className={segmentClass(active)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={15} aria-hidden />
              {t(key)}
            </LockedFeatureTrigger>
          )
        }

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={segmentClass(active)}
          >
            <Icon size={15} aria-hidden />
            {t(key)}
          </Link>
        )
      })}
    </nav>
  )
}
