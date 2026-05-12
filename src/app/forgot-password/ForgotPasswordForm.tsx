'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, MailCheck } from 'lucide-react'

import { sendPasswordResetEmail } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(sendPasswordResetEmail, null)
  const t = useTranslations('auth.forgotPassword')

  if (state?.sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck className="size-10 text-teal-600" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('successBody', { email: state.email ?? '' })}
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="block text-foreground">
          {t('email')}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-4 text-base font-semibold text-white shadow-lg shadow-teal-600/20 transition-[filter,box-shadow] hover:brightness-105 hover:shadow-lg hover:shadow-violet-500/25"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}
