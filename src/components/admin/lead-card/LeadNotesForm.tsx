'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { LeadActionState } from '@/app/(admin)/admin/leads/actions'

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>

/**
 * Free-text notes with an explicit save. Autosave-on-blur would race the
 * server re-render that follows every action and wipe what was being typed.
 */
export function LeadNotesForm({ leadId, notes, action }: { leadId: string; notes: string | null; action: LeadAction }) {
  const t = useTranslations('admin.leads.card')
  const [state, formAction, pending] = useActionState(action, null)
  const [value, setValue] = useState(notes ?? '')
  const dirty = value !== (notes ?? '')

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`notes-${leadId}`} className="text-xs font-medium text-muted-foreground">
        {t('notes')}
      </label>
      <Textarea
        id={`notes-${leadId}`}
        name="notes"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('notesPlaceholder')}
        maxLength={5000}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending || !dirty}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {t('saveNotes')}
        </Button>
        {state?.ok && !dirty && <span className="text-xs text-emerald-600">{t('saved')}</span>}
        {state?.error && <span className="text-xs text-destructive">{t('saveFailed')}</span>}
      </div>
    </form>
  )
}
