'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'

import { updatePassword } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null)
  const t = useTranslations('auth.resetPassword')

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password" className="block text-foreground">
          {t('password')}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          dir="ltr"
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm" className="block text-foreground">
          {t('confirmPassword')}
        </Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
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
