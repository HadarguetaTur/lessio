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

interface TeacherInviteFormProps {
  action: FormAction
  onSuccess?: () => void
  onCancel?: () => void
}

export function TeacherInviteForm({ action, onSuccess, onCancel }: TeacherInviteFormProps) {
  const t = useTranslations('teachers')
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
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">
          {t('fields.email')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          dir="ltr"
          placeholder="teacher@example.com"
        />
        <p className="text-xs text-muted-foreground">{t('inviteEmailHint')}</p>
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? t('sendingInvite') : t('sendInvite')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>{tCommon('actions.cancel')}</Button>
        ) : (
          <Link href="/teachers">
            <Button type="button" variant="outline">{tCommon('actions.cancel')}</Button>
          </Link>
        )}
      </div>
    </form>
  )
}
