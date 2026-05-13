'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completeGoogleSignup } from './actions'

type Props = {
  defaultFullName: string
  email: string
}

export function CompleteSignupForm({ defaultFullName, email }: Props) {
  const [state, action, pending] = useActionState(completeGoogleSignup, null)
  const t = useTranslations('auth.signupComplete')

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-foreground">{t('email')}</Label>
        <Input
          value={email}
          readOnly
          dir="ltr"
          className="h-11 bg-muted/50 px-3.5 text-muted-foreground"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name" className="text-foreground">
          {t('fullName')}
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          defaultValue={defaultFullName}
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org_name" className="text-foreground">
          {t('orgName')}
        </Label>
        <Input
          id="org_name"
          name="org_name"
          type="text"
          required
          placeholder={t('orgNamePlaceholder')}
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
