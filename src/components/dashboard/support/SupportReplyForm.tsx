'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ReplyAction = (
  prev: { error: string | null } | null,
  formData: FormData
) => Promise<{ error: string | null }>

/**
 * Reply box on a ticket thread. The action arrives as a prop so this component
 * can serve both the customer and admin shells (Server Action prop rule).
 */
export function SupportReplyForm({
  ticketId,
  reply,
  placeholderKey = 'placeholder',
}: {
  ticketId: string
  reply: ReplyAction
  /** Which side is writing — the box reads differently to a customer and to us. */
  placeholderKey?: 'placeholder' | 'adminPlaceholder'
}) {
  const t = useTranslations('support.reply')
  const [state, formAction, pending] = useActionState(reply, null)
  const formRef = useRef<HTMLFormElement>(null)

  // Clear the box once the message is actually on the thread — not on submit,
  // so a rejected reply (closed ticket, validation) keeps what was typed.
  useEffect(() => {
    if (state && !state.error) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Textarea
        name="body"
        required
        rows={4}
        maxLength={5000}
        placeholder={t(placeholderKey)}
        aria-label={t('label')}
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : t('send')}
        </Button>
      </div>
    </form>
  )
}
