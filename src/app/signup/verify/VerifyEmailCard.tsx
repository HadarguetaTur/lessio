'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'

import { PenCheckbox } from '@/components/marketing/LandingPenMarks'
import { resendVerificationEmail } from './actions'

/** The "check your email" note: a ticked box the pen draws, then the address it went to. */
export function VerifyEmailCard({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerificationEmail, null)
  const t = useTranslations('auth.signup.verify')

  return (
    <div className="text-center sm:text-start" data-pen>
      <PenCheckbox className="doodle mx-auto sm:mx-0" />

      <p className="text-[color:var(--ink-2)]">{t('body', { email })}</p>

      {state?.error ? (
        <p role="alert" className="form-error">
          {t('error')}
        </p>
      ) : null}

      {state?.sent ? <p className="pen text-[1.4rem] text-[color:var(--cover)]">{t('resent')}</p> : null}

      <form action={action} className="np-action">
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={pending || !!state?.sent} className="link-rule min-h-11 disabled:opacity-60">
          {pending ? t('resending') : t('resend')}
        </button>
      </form>
    </div>
  )
}
