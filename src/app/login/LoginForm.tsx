'use client'

import { useActionState } from 'react'
import { signIn } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">אימייל</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          dir="ltr"
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full h-10">
        {pending ? 'מתחבר...' : 'התחברות'}
      </Button>
    </form>
  )
}
