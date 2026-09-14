'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * Two panes on a wide screen; one at a time on a phone.
 *
 * Which one a phone shows is decided by the URL, not by CSS guessing at the
 * children: `/messages` is the list, anything deeper is a conversation. That
 * keeps the back button meaningful — leaving a thread on a phone means going
 * back to `/messages`, which is what the browser's own back does anyway.
 *
 * The rail lives in the layout rather than in each page, so moving between
 * conversations never refetches or rescrolls it.
 */
export function InboxPanes({
  rail,
  thread,
}: {
  rail: React.ReactNode
  thread: React.ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('inbox.nav')
  const onThread = pathname !== '/messages'

  return (
    <div className="grid h-full min-h-[480px] grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <aside
        aria-label={t('conversations')}
        className={`min-h-0 overflow-hidden rounded-lg border border-border bg-card ${
          onThread ? 'max-lg:hidden' : ''
        }`}
      >
        {rail}
      </aside>

      <section
        className={`min-h-0 overflow-hidden rounded-lg border border-border bg-card ${
          onThread ? '' : 'max-lg:hidden'
        }`}
      >
        {thread}
      </section>
    </div>
  )
}
