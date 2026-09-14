import { TAG_TONES, type InboxTag, type TagTone } from '@/lib/inbox/tags'

/**
 * The colour of each tag tone. Shared by the list row and the thread header so
 * a tag looks the same in both places — the point of a tag is that you learn
 * it once.
 */
const TONE_CLASS: Record<TagTone, string> = {
  attention:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  active:
    'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  danger:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  muted: 'border-border bg-muted text-muted-foreground',
  neutral: 'border-border text-muted-foreground',
}

export const TAG_BASE_CLASS =
  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium'

export function tagClass(tag: InboxTag): string {
  return `${TAG_BASE_CLASS} ${TONE_CLASS[tag.kind === 'static' ? TAG_TONES[tag.id] : 'neutral']}`
}

export function tagKey(tag: InboxTag): string {
  return tag.kind === 'static' ? tag.id : `${tag.kind}:${tag.name}`
}
