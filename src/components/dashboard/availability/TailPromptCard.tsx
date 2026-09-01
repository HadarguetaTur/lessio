'use client'

/**
 * "You have twenty minutes stranded at the end of Thursday — what would you
 * like to do?"
 *
 * Shared by the teacher's own availability page and the owner's per-teacher
 * one, taking its three actions by injection like the editors beside it.
 *
 * The card only appears when the server has re-confirmed the remainder still
 * exists, so it never asks about time a cancelled lesson already freed.
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface TailPromptView {
  id: string
  /** YYYY-MM-DD in org timezone */
  date: string
  /** HH:MM in org timezone */
  start: string
  end: string
  minutes: number
  /** Prefilled "extend until", long enough to fit the shortest lesson. */
  suggestedEnd: string
}

type ActionState = { error: string } | null
type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

interface Props {
  prompts: TailPromptView[]
  blockAction: FormAction
  extendAction: FormAction
  dismissAction: FormAction
  readOnly?: boolean
}

export function TailPromptCard({
  prompts,
  blockAction,
  extendAction,
  dismissAction,
  readOnly = false,
}: Props) {
  const t = useTranslations('teacherSelf.tail')

  if (prompts.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Clock size={16} className="text-muted-foreground" aria-hidden />
        {t('title')}
      </h2>

      {prompts.map((prompt) => (
        <TailPromptRow
          key={prompt.id}
          prompt={prompt}
          blockAction={blockAction}
          extendAction={extendAction}
          dismissAction={dismissAction}
          readOnly={readOnly}
        />
      ))}
    </section>
  )
}

function TailPromptRow({
  prompt,
  blockAction,
  extendAction,
  dismissAction,
  readOnly,
}: {
  prompt: TailPromptView
  blockAction: FormAction
  extendAction: FormAction
  dismissAction: FormAction
  readOnly: boolean
}) {
  const t = useTranslations('teacherSelf.tail')

  const [blockState, block, blocking] = useActionState(blockAction, null)
  const [extendState, extend, extending] = useActionState(extendAction, null)
  const [dismissState, dismiss, dismissing] = useActionState(dismissAction, null)

  const [showExtend, setShowExtend] = useState(false)
  const [newEnd, setNewEnd] = useState(prompt.suggestedEnd)

  const busy = blocking || extending || dismissing
  const error = blockState?.error ?? extendState?.error ?? dismissState?.error

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-sm text-foreground">
        {t('summary', {
          date: prompt.date,
          minutes: prompt.minutes,
          start: prompt.start,
          end: prompt.end,
        })}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={block}>
          <input type="hidden" name="prompt_id" value={prompt.id} />
          <Button type="submit" variant="outline" size="sm" disabled={readOnly || busy}>
            {blocking && <Loader2 size={14} className="animate-spin" />}
            {t('block')}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || busy}
          onClick={() => setShowExtend((v) => !v)}
        >
          {t('extend')}
        </Button>

        <form action={dismiss} className="ms-auto">
          <input type="hidden" name="prompt_id" value={prompt.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={readOnly || busy}>
            {dismissing && <Loader2 size={14} className="animate-spin" />}
            {t('dismiss')}
          </Button>
        </form>
      </div>

      {showExtend && (
        <form action={extend} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="prompt_id" value={prompt.id} />
          <div>
            <label
              htmlFor={`new_end_${prompt.id}`}
              className="block text-xs font-medium text-foreground"
            >
              {t('extendTo')}
            </label>
            <Input
              id={`new_end_${prompt.id}`}
              name="new_end_time"
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              disabled={readOnly || busy}
              className="mt-1 w-32"
            />
          </div>
          <Button type="submit" size="sm" disabled={readOnly || busy}>
            {extending && <Loader2 size={14} className="animate-spin" />}
            {t('extend')}
          </Button>
          <p className="w-full text-xs text-muted-foreground">{t('extendHint')}</p>
        </form>
      )}

      {!showExtend && <p className="mt-2 text-xs text-muted-foreground">{t('blockHint')}</p>}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
