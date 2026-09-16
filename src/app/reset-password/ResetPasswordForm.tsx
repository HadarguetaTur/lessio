'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'

import { DiaryField } from '@/components/diary/DiaryField'
import { updatePassword } from './actions'

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null)
  const t = useTranslations('auth.resetPassword')

  return (
    <form action={action} className="grid gap-6">
      <DiaryField
        id="password"
        name="password"
        label={t('password')}
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
        dir="ltr"
      />

      <DiaryField
        id="confirm"
        name="confirm"
        label={t('confirmPassword')}
        type="password"
        required
        autoComplete="new-password"
        placeholder="••••••••"
        dir="ltr"
        error={state?.error ?? null}
      />

      <div>
        <button type="submit" disabled={pending} className="hl-cta" data-cta="reset-submit">
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}
