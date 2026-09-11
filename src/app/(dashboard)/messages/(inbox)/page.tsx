import { MessageSquare } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/**
 * The right pane with nothing open.
 *
 * On a phone this never shows — `InboxPanes` gives the whole width to the rail
 * at `/messages` — so this is the desktop resting state: the list is on the
 * left, and here is where a conversation will appear.
 */
export default async function InboxIndexPage() {
  const t = await getTranslations('inbox.empty')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <MessageSquare size={26} aria-hidden className="text-muted-foreground" />
      <p className="text-sm font-medium">{t('pickOne')}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t('pickOneHint')}</p>
    </div>
  )
}
