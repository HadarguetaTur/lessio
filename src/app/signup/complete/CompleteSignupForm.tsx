'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'

import { DiaryField } from '@/components/diary/DiaryField'
import { completeGoogleSignup } from './actions'

type Props = {
  defaultFullName: string
  email: string
}

export function CompleteSignupForm({ defaultFullName, email }: Props) {
  const [state, action, pending] = useActionState(completeGoogleSignup, null)
  const t = useTranslations('auth.signupComplete')

  return (
    <form action={action}>
      <DiaryField id="email" label={t('email')} type="email" value={email} readOnly dir="ltr" />

      <DiaryField
        id="full_name"
        name="full_name"
        label={t('fullName')}
        type="text"
        required
        autoComplete="name"
        defaultValue={defaultFullName}
      />

      <DiaryField id="org_name" name="org_name" label={t('orgName')} type="text" required placeholder={t('orgNamePlaceholder')} />

      {state?.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}

      <div className="np-action">
        <button type="submit" disabled={pending} className="hl-cta" data-cta="signup-complete-submit">
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}
