'use client'

import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface ParentFormProps {
  action: FormAction
  defaultValues?: {
    full_name?: string
    phone?: string
    notes?: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

export function ParentForm({ action, defaultValues, onSuccess, onCancel }: ParentFormProps) {
  const t = useTranslations('parents')
  const tCommon = useTranslations('common')
  const didSubmitRef = useRef(false)
  const [state, formAction, pending] = useActionState(action, null)

  useEffect(() => {
    if (didSubmitRef.current && !pending && !state?.error) {
      onSuccess?.()
    }
  }, [state, pending, onSuccess])

  return (
    <form
      action={formAction}
      onSubmit={() => { didSubmitRef.current = true }}
      className="space-y-5"
    >
      {state?.error && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="full_name">
          {t('fields.fullName')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={defaultValues?.full_name ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          {t('fields.phone')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          dir="ltr"
          placeholder="0501234567"
          defaultValue={defaultValues?.phone ?? ''}
        />
        <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">{t('fields.notes')}</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ''}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('actions.saving') : tCommon('actions.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>{tCommon('actions.cancel')}</Button>
        ) : (
          <Link href="/parents">
            <Button type="button" variant="outline">{tCommon('actions.cancel')}</Button>
          </Link>
        )}
      </div>
    </form>
  )
}
