'use client'

import { useActionState } from 'react'
import { signUp } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, null)

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="org_name">שם העסק / הארגון</Label>
        <Input
          id="org_name"
          name="org_name"
          type="text"
          required
          placeholder="לדוגמה: מתמטיקה עם דנה"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="full_name">שם מלא</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder="ישראל ישראלי"
        />
      </div>

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
          autoComplete="new-password"
          placeholder="6 תווים לפחות"
          dir="ltr"
          minLength={6}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">אימות סיסמה</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="הקלד שוב את הסיסמה"
          dir="ltr"
          minLength={6}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full h-10">
        {pending ? 'יוצר חשבון...' : 'צור חשבון'}
      </Button>
    </form>
  )
}
