'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, GraduationCap, Users } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'

interface ImportStudentsStepProps {
  orgId: string
  onNext: () => void
  onBack: () => void
  onCountsChange: (students: number, parents: number) => void
}

type Tab = 'students' | 'parents'

export function ImportStudentsStep({
  orgId,
  onNext,
  onBack,
  onCountsChange,
}: ImportStudentsStepProps) {
  const [tab, setTab] = useState<Tab>('students')
  const [studentsDone, setStudentsDone] = useState(false)
  const [parentsDone, setParentsDone] = useState(false)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">יבוא תלמידים והורים</h2>
        <p className="text-muted-foreground mt-2">
          העלה קובץ אקסל או CSV עם הנתונים הקיימים שלך. הורד את התבנית כדי לראות את הפורמט הנדרש.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab('students')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'students'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <GraduationCap size={15} />
          תלמידים
          {studentsDone && <span className="text-emerald-600 text-xs mr-1">✓</span>}
        </button>
        <button
          onClick={() => setTab('parents')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'parents'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users size={15} />
          הורים
          {parentsDone && <span className="text-emerald-600 text-xs mr-1">✓</span>}
        </button>
      </div>

      {/* Import flow */}
      {tab === 'students' && (
        <ImportFlow
          entityType="students"
          orgId={orgId}
          onComplete={(count) => {
            setStudentsDone(true)
            onCountsChange(count, 0)
          }}
        />
      )}
      {tab === 'parents' && (
        <ImportFlow
          entityType="parents"
          orgId={orgId}
          onComplete={(count) => {
            setParentsDone(true)
            onCountsChange(0, count)
          }}
        />
      )}

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={14} className="ml-1.5" />
          חזרה
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext}>
            דלג
          </Button>
          <Button onClick={onNext}>
            המשך
          </Button>
        </div>
      </div>
    </div>
  )
}
