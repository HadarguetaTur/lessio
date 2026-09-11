'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Hand, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ActionResult = { error: string | null }

/**
 * "I am handling this one" — as a button, at last.
 *
 * Before this, silencing the bot on a conversation happened only as a side
 * effect of sending a message, and no screen mentioned it. Someone who wanted
 * to step into a thread before writing had no way to; someone who had already
 * written had no idea the bot had gone quiet for six hours.
 *
 * So both directions are explicit, and the hint says what actually happens,
 * including that it lapses on its own — the property that makes it safe to
 * press without thinking.
 */
export function TakeoverToggle({
  takenOver,
  takenOverBy,
  takenOverUntil,
  takeAction,
  releaseAction,
}: {
  takenOver: boolean
  takenOverBy: string | null
  /** Local time the hold lapses, pre-formatted on the server. */
  takenOverUntil: string | null
  takeAction: () => Promise<ActionResult>
  releaseAction: () => Promise<ActionResult>
}) {
  const t = useTranslations('inbox.thread')
  const [takeState, take, taking] = useActionState(takeAction, { error: null })
  const [releaseState, release, releasing] = useActionState(releaseAction, { error: null })
  const error = takeState.error ?? releaseState.error

  return (
    <div className="flex flex-col items-start gap-1">
      {takenOver ? (
        <form action={release}>
          <Button type="submit" variant="outline" size="sm" disabled={releasing}>
            <Undo2 size={14} aria-hidden />
            {t('release')}
          </Button>
        </form>
      ) : (
        <form action={take}>
          <Button type="submit" variant="outline" size="sm" disabled={taking}>
            <Hand size={14} aria-hidden />
            {t('takeOver')}
          </Button>
        </form>
      )}

      <p className="max-w-xs text-[11px] text-muted-foreground">
        {takenOver
          ? takenOverBy && takenOverUntil
            ? t('heldByUntil', { name: takenOverBy, time: takenOverUntil })
            : takenOverUntil
              ? t('heldUntil', { time: takenOverUntil })
              : t('heldHint')
          : t('takeOverHint')}
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
