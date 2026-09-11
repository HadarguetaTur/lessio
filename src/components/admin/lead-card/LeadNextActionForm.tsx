'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarClock, Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { LeadActionState } from '@/app/(admin)/admin/leads/actions'

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>

/**
 * "Come back to this person on…". The value shown is local wall-clock in the
 * founder's timezone (what datetime-local expects); the action converts it.
 */
export function LeadNextActionForm({
  leadId,
  nextActionLocal,
  note,
  due,
  action,
}: {
  leadId: string
  /** `yyyy-MM-ddTHH:mm` in Asia/Jerusalem, or '' when none is set. */
  nextActionLocal: string
  note: string | null
  due: boolean
  action: LeadAction
}) {
  const t = useTranslations('admin.leads.card')
  const [state, formAction, pending] = useActionState(action, null)
  const [at, setAt] = useState(nextActionLocal)
  const [text, setText] = useState(note ?? '')
  const dirty = at !== nextActionLocal || text !== (note ?? '')

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', due ? 'text-destructive' : 'text-muted-foreground')}>
        <CalendarClock size={14} />
        {t('nextAction')}
        {due && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px]">{t('dueNow')}</span>}
      </span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <Input
          type="datetime-local"
          name="nextActionAt"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          dir="ltr"
          className="sm:w-52"
        />
        <Input
          name="note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('nextActionNote')}
          maxLength={500}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending || !dirty}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {t('saveNextAction')}
        </Button>
        {nextActionLocal && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setAt('')
              setText('')
              const fd = new FormData()
              fd.set('leadId', leadId)
              fd.set('nextActionAt', '')
              fd.set('note', '')
              formAction(fd)
            }}
          >
            <X size={14} />
            {t('clearNextAction')}
          </Button>
        )}
        {state?.error && <span className="text-xs text-destructive">{t('saveFailed')}</span>}
      </div>
    </form>
  )
}
