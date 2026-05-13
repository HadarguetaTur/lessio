'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { MailCheck, AlertCircle } from 'lucide-react'

import { resendVerificationEmail } from './actions'
import { Button } from '@/components/ui/button'

export function VerifyEmailCard({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerificationEmail, null)
  const t = useTranslations('auth.signup.verify')

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <MailCheck className="size-10 text-teal-600" />

      <p className="text-sm leading-relaxed text-muted-foreground">
        {t('body', { email })}
      </p>

      {state?.error && (
        <div className="flex w-full items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" aria-hidden />
          <span>{t('error')}</span>
        </div>
      )}

      {state?.sent && (
        <p className="text-sm font-medium text-teal-600">{t('resent')}</p>
      )}

      <form action={action} className="w-full">
        <input type="hidden" name="email" value={email} />
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !!state?.sent}
          className="h-11 w-full"
        >
          {pending ? t('resending') : t('resend')}
        </Button>
      </form>
    </div>
  )
}
