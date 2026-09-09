'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Megaphone } from 'lucide-react'

type Result = { error: string | null; sent?: number }
const initial: Result = { error: null }

/**
 * A teacher telling this lesson's parents something about it.
 *
 * Kept to one box and one button. A teacher wants to say "we're in room 3 this
 * week" between lessons, not compose a campaign — the audience, the category
 * and the timing are all decided for them, and the note under the box says who
 * will receive it.
 */
export function LessonUpdateForm({
  action,
  recipientCount,
  maxLength,
}: {
  action: (prev: Result, formData: FormData) => Promise<Result>
  recipientCount: number
  maxLength: number
}) {
  const t = useTranslations('teacherSelf.lessonUpdate')
  const [state, formAction, pending] = useActionState(action, initial)

  return (
    <form action={formAction} className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Megaphone size={15} />
          {t('title')}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('subtitle', { count: recipientCount })}
        </p>
      </div>

      <textarea
        name="message"
        rows={3}
        maxLength={maxLength}
        required
        placeholder={t('placeholder')}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t('note')}</p>
        <button
          type="submit"
          disabled={pending || recipientCount === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {t('send')}
        </button>
      </div>

      {state.error && <p className="text-xs text-destructive">{t(`errors.${state.error}`)}</p>}
      {!state.error && state.sent !== undefined && (
        <p className="text-xs text-green-700">{t('sent', { count: state.sent })}</p>
      )}
    </form>
  )
}
