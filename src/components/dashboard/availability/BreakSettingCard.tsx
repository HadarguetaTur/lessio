'use client'

/**
 * The break a teacher needs between lessons, shared by the owner route
 * (/teachers/[id]/availability) and the session's own route
 * (/teacher/availability).
 *
 * Empty means "follow the business default", which is a different answer from
 * 0 ("I teach back-to-back") — the placeholder says so, because a number field
 * left blank otherwise reads as unset rather than as a choice.
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ActionState = { error: string } | null
type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>

interface Props {
  /** NULL when the teacher follows the organization default. */
  value: number | null
  orgDefault: number
  action: FormAction
  /** Support mode is read-only; every write would throw at requireMutation. */
  readOnly?: boolean
}

export function BreakSettingCard({ value, orgDefault, action, readOnly = false }: Props) {
  const t = useTranslations('teacherSelf.breakSetting')
  const tCommon = useTranslations('common')

  const [state, formAction, isPending] = useActionState(action, null)
  const [draft, setDraft] = useState(value === null ? '' : String(value))

  const effective = draft.trim() === '' ? orgDefault : Number(draft)

  return (
    <form
      action={formAction}
      className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm space-y-3"
    >
      <div>
        <label htmlFor="break_duration_minutes" className="block text-sm font-medium text-foreground">
          {t('label')}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('hint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="break_duration_minutes"
          name="break_duration_minutes"
          type="number"
          min={0}
          max={120}
          step={5}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('inheritPlaceholder', { minutes: orgDefault })}
          disabled={readOnly || isPending}
          className="w-40"
        />
        <span className="text-sm text-muted-foreground">{t('minutes')}</span>

        <Button type="submit" disabled={readOnly || isPending} className="ms-auto">
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {tCommon('actions.save')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {draft.trim() === ''
          ? t('inheriting', { minutes: orgDefault })
          : effective === 0
            ? t('noBreak')
            : t('effective', { minutes: effective })}
      </p>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}
