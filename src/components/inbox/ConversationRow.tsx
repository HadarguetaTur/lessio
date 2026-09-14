'use client'

import Link from 'next/link'
import { DateTime } from 'luxon'
import { useTranslations } from 'next-intl'
import { splitTags, type InboxTag } from '@/lib/inbox/tags'
import { tagClass, tagKey } from './tagStyles'
import type { InboxRow } from '@/lib/inbox/rows'

/**
 * One line in the inbox: who, when, what was last said and by whom, and the
 * two or three things about this conversation that change what you do next.
 *
 * Modelled on the mail/chat list everybody already knows — an unanswered row
 * reads bold, the way an unread email does, so "who is waiting for me" is
 * answered by scanning rather than by reading.
 */

/** Two initials, or the last two digits when a number has no name yet. */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (/^\+?\d/.test(words[0])) return label.replace(/\D/g, '').slice(-2)
  return words.slice(0, 2).map((w) => w[0]).join('')
}

const ROLE_AVATAR: Record<string, string> = {
  parent: 'bg-primary/10 text-primary',
  student: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  teacher: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  staff: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  unknown: 'bg-muted text-muted-foreground',
}

export function ConversationRow({
  row,
  tags,
  active,
  timezone,
  locale,
}: {
  row: InboxRow
  tags: InboxTag[]
  active: boolean
  timezone: string
  locale: string
}) {
  const t = useTranslations('inbox')
  const name = row.displayName ?? row.fallbackLabel
  const { visible, hidden } = splitTags(tags)

  const when = DateTime.fromISO(row.lastMessageAt).setZone(timezone).setLocale(locale)
  const relative = when.toRelative({ style: 'short' }) ?? when.toFormat('dd/MM')

  // Who spoke last. An inbound message needs no prefix — it is their voice.
  const prefix = row.awaitingReply
    ? null
    : row.channel === 'portal'
      ? t('preview.you')
      : row.lastInbound
        ? null
        : row.lastOrigin === 'ai'
          ? t('preview.ai')
          : row.lastOrigin === 'bot' || row.lastOrigin === 'cron'
            ? t('preview.bot')
            : row.lastOrigin === 'broadcast'
              ? t('preview.broadcast')
              : t('preview.you')

  return (
    <Link
      href={row.href}
      aria-current={active ? 'page' : undefined}
      className={`flex gap-3 border-b border-border px-3 py-3 transition-colors last:border-b-0 ${
        active ? 'bg-accent' : 'hover:bg-muted/60'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          ROLE_AVATAR[row.senderRole] ?? ROLE_AVATAR.unknown
        }`}
      >
        {initials(name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-sm ${
              row.awaitingReply ? 'font-semibold text-foreground' : 'font-medium text-foreground'
            }`}
          >
            {name}
          </span>
          <time
            dateTime={row.lastMessageAt}
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            {relative}
          </time>
        </span>

        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {prefix ? <span className="font-medium">{prefix} </span> : null}
          {row.lastMessage}
        </span>

        {visible.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {visible.map((tag) => (
              <span
                key={tagKey(tag)}
                className={tagClass(tag)}
              >
                {tag.kind === 'static' ? t(`tags.${tag.id}`) : tag.name}
              </span>
            ))}
            {hidden > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {t('tags.more', { count: hidden })}
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  )
}
