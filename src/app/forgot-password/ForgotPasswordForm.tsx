'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'

import { DiaryField } from '@/components/diary/DiaryField'
import { PenCheckbox } from '@/components/marketing/LandingPenMarks'
import { sendPasswordResetEmail } from './actions'

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(sendPasswordResetEmail, null)
  const t = useTranslations('auth.forgotPassword')

  if (state?.sent) {
    return (
      <div className="grid gap-6 text-center sm:text-start" data-pen>
        <PenCheckbox className="doodle mx-auto size-14 sm:mx-0" />
        <p className="text-[color:var(--ink-2)]">{t('successBody', { email: state.email ?? '' })}</p>
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-6">
      <DiaryField
        id="email"
        name="email"
        label={t('email')}
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        dir="ltr"
        error={state?.error ?? null}
      />

      <div>
        <button type="submit" disabled={pending} className="hl-cta" data-cta="forgot-submit">
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}
