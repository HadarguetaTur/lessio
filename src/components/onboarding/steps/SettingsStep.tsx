'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AlertCircle, ArrowRight, Settings } from 'lucide-react'
import { updateBasicSettings } from '@/app/(onboarding)/onboarding/actions'

interface SettingsStepProps {
  onNext: () => void
  onBack: () => void
}

export function SettingsStep({ onNext, onBack }: SettingsStepProps) {
  const [state, action, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await updateBasicSettings(_prev, formData)
      if (!result) onNext()
      return result
    },
    null
  )

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Settings size={28} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">הגדרות בסיסיות</h2>
        <p className="text-muted-foreground mt-2">
          הגדר את מדיניות הביטולים והתזכורות. ניתן לשנות בכל עת מההגדרות.
        </p>
      </div>

      <form action={action} className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
        {state?.error && (
          <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">מדיניות ביטולים</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notice_hours">שעות התראה מראש</Label>
              <select
                id="notice_hours"
                name="notice_hours"
                defaultValue="24"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="2">2 שעות</option>
                <option value="4">4 שעות</option>
                <option value="12">12 שעות</option>
                <option value="24">24 שעות</option>
                <option value="48">48 שעות</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge_percent">אחוז חיוב בביטול מאוחר</Label>
              <select
                id="charge_percent"
                name="charge_percent"
                defaultValue="50"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="0">0%</option>
                <option value="25">25%</option>
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">תזכורות</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lesson_reminder_hours">תזכורת שיעור (שעות לפני)</Label>
              <select
                id="lesson_reminder_hours"
                name="lesson_reminder_hours"
                defaultValue="24"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="2">2 שעות</option>
                <option value="4">4 שעות</option>
                <option value="12">12 שעות</option>
                <option value="24">24 שעות</option>
                <option value="48">48 שעות</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment_reminder_days">תזכורת תשלום (ימים)</Label>
              <select
                id="payment_reminder_days"
                name="payment_reminder_days"
                defaultValue="7"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="3">3 ימים</option>
                <option value="5">5 ימים</option>
                <option value="7">7 ימים</option>
                <option value="14">14 ימים</option>
                <option value="30">30 ימים</option>
              </select>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={pending} className="w-full h-10">
          {pending ? 'שומר...' : 'המשך'}
        </Button>
      </form>

      <div className="flex justify-start mt-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={14} className="ml-1.5" />
          חזרה
        </Button>
      </div>
    </div>
  )
}
