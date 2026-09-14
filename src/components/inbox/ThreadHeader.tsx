import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { InboxTag } from '@/lib/inbox/tags'
import { tagClass, tagKey } from './tagStyles'


/**
 * Who this is, what is going on, and the one control that matters here:
 * whether the bot or a person is answering.
 *
 * The back arrow only appears on a phone, where the list and the thread take
 * turns on the screen; on a wide screen the list is already beside it.
 */
export async function ThreadHeader({
  title,
  subtitle,
  tags,
  actions,
}: {
  title: string
  subtitle: string
  tags: InboxTag[]
  actions?: React.ReactNode
}) {
  const t = await getTranslations('inbox')

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href="/messages"
          aria-label={t('thread.back')}
          className="mt-1 text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          <p className="truncate text-xs text-muted-foreground" dir="auto">
            {subtitle}
          </p>
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tagKey(tag)}
                  className={tagClass(tag)}
                >
                  {tag.kind === 'static' ? t(`tags.${tag.id}`) : tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {actions}
    </header>
  )
}
