'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Sparkles } from 'lucide-react'
import { updateOrgSettings } from '@/app/(onboarding)/onboarding/actions'

const TIMEZONES = [
  { value: 'Asia/Jerusalem', label: 'ישראל (Asia/Jerusalem)' },
  { value: 'Europe/London', label: 'לונדון (Europe/London)' },
  { value: 'America/New_York', label: 'ניו יורק (America/New_York)' },
  { value: 'America/Los_Angeles', label: 'לוס אנג\'לס (America/Los_Angeles)' },
  { value: 'Europe/Berlin', label: 'ברלין (Europe/Berlin)' },
]

interface WelcomeStepProps {
  orgName: string
  ownerName: string
  timezone: string
  billingMode: string
  onNext: () => void
}

export function WelcomeStep({
  orgName,
  ownerName,
  timezone,
  billingMode,
  onNext,
}: WelcomeStepProps) {
  const [state, action, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await updateOrgSettings(_prev, formData)
      if (!result) onNext()
      return result
    },
    null
  )

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={28} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          ברוכים הבאים, {ownerName}!
        </h2>
        <p className="text-muted-foreground mt-2">
          בואו נגדיר את הפרטים הבסיסיים של <strong>{orgName}</strong>
        </p>
      </div>

      <form action={action} className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-5">
        {state?.error && (
          <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="timezone">אזור זמן</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={timezone}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>מודל חיוב</Label>
          <div className="grid grid-cols-2 gap-3">
            <label className="relative flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <Input
                type="radio"
                name="billing_mode"
                value="monthly"
                defaultChecked={billingMode === 'monthly'}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">חודשי</div>
                <div className="text-xs text-muted-foreground">תשלום חודשי קבוע</div>
              </div>
            </label>
            <label className="relative flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <Input
                type="radio"
                name="billing_mode"
                value="per_lesson"
                defaultChecked={billingMode === 'per_lesson'}
                className="w-4 h-4"
              />
              <div>
                <div className="text-sm font-medium">לפי שיעור</div>
                <div className="text-xs text-muted-foreground">תשלום לכל שיעור</div>
              </div>
            </label>
          </div>
        </div>

        <Button type="submit" disabled={pending} className="w-full h-10">
          {pending ? 'שומר...' : 'המשך'}
        </Button>
      </form>
    </div>
  )
}
