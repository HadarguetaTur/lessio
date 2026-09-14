import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { InboxNav } from '@/components/inbox/InboxNav'
import { InboxStatusStrip } from '@/components/inbox/InboxStatusStrip'

/**
 * The inbox frame: what the number is doing, and the three places inside.
 *
 * Everything to do with talking to families now lives under /messages —
 * conversations, lists and broadcasts — because a studio owner does not think
 * of those as three features. Before this they were three pages in two
 * different shapes, with the Meta status hidden in settings, and the reaction
 * to opening the product was that none of it was findable.
 *
 * Teachers get the frame without the segmented control: they have exactly one
 * place here, and a control with one segment is furniture.
 */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([getSession(), getTranslations('inbox')])
  const isStaff = session.role === 'owner' || session.role === 'admin'

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          <InboxStatusStrip orgId={session.orgId} canFix={session.role === 'owner'} />
        </div>
        <InboxNav showAll={isStaff} />
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
