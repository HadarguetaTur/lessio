'use client'

import { Button } from '@/components/ui/button'
import { CheckCircle2, GraduationCap, Users, BookOpen, UserCheck } from 'lucide-react'
import { completeOnboarding } from '@/app/(onboarding)/onboarding/actions'
import { useState } from 'react'

interface CompleteStepProps {
  counts: {
    students: number
    parents: number
    lessons: number
    teachers: number
  }
}

export function CompleteStep({ counts }: CompleteStepProps) {
  const [pending, setPending] = useState(false)

  const handleComplete = async () => {
    setPending(true)
    await completeOnboarding()
  }

  const stats = [
    { label: 'מורים', value: counts.teachers, icon: UserCheck, color: 'text-blue-600 bg-blue-50' },
    { label: 'תלמידים', value: counts.students, icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'הורים', value: counts.parents, icon: Users, color: 'text-purple-600 bg-purple-50' },
    { label: 'שיעורים', value: counts.lessons, icon: BookOpen, color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 size={40} className="text-emerald-600" />
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-2">הכל מוכן!</h2>
      <p className="text-muted-foreground mb-8">
        המערכת שלך מוכנה לשימוש. הנה סיכום של מה שהגדרת:
      </p>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl border border-border p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
              <stat.icon size={20} />
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={handleComplete}
        disabled={pending}
        className="w-full h-12 text-base"
      >
        {pending ? 'עובר לדשבורד...' : 'כניסה לדשבורד'}
      </Button>
    </div>
  )
}
