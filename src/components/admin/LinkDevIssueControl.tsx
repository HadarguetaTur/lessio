'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface LinkableIssue {
  id: string
  title: string
  event_count: number
  org_count: number
}

type LinkAction = (
  prev: { error: string | null } | null,
  formData: FormData
) => Promise<{ error: string | null }>

/**
 * Links a support ticket to the dev issue it is a report of.
 *
 * A dialog with a list rather than a dropdown: there is no select primitive in
 * this codebase, and an issue needs two lines (title plus how many orgs it hits)
 * to be recognisable, which an option element cannot carry.
 */
export function LinkDevIssueControl({
  ticketId,
  currentIssueId,
  issues,
  link,
}: {
  ticketId: string
  currentIssueId: string | null
  issues: LinkableIssue[]
  link: LinkAction
}) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('admin.support.linkIssue')
  const [state, formAction, pending] = useActionState(link, null)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {currentIssueId ? t('change') : t('link')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>

          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="ticket_id" value={ticketId} />

            {issues.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t('none')}</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {issues.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="submit"
                      name="issue_id"
                      value={issue.id}
                      disabled={pending}
                      className={cn(
                        'w-full px-3 py-2.5 text-start transition-colors hover:bg-muted/50 disabled:opacity-50',
                        issue.id === currentIssueId && 'bg-muted'
                      )}
                    >
                      <span className="block truncate font-mono text-xs text-foreground">
                        {issue.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('meta', { events: issue.event_count, orgs: issue.org_count })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {currentIssueId ? (
              <Button
                type="submit"
                name="issue_id"
                value=""
                variant="ghost"
                size="sm"
                disabled={pending}
                className="self-start text-destructive"
              >
                {t('unlink')}
              </Button>
            ) : null}

            {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
