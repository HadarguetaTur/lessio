'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, CalendarDays, History } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'

interface ImportLessonsStepProps {
  orgId: string
  onNext: () => void
  onBack: () => void
  onCountChange: (count: number) => void
}

type Tab = 'schedule' | 'history'

export function ImportLessonsStep({
  orgId,
  onNext,
  onBack,
  onCountChange,
}: ImportLessonsStepProps) {
  const [tab, setTab] = useState<Tab>('schedule')
  const [scheduleDone, setScheduleDone] = useState(false)
  const [historyDone, setHistoryDone] = useState(false)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">יבוא שיעורים</h2>
        <p className="text-muted-foreground mt-2">
          ייבא את מערכת השעות החוזרת שלך או היסטוריית שיעורים קיימת
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab('schedule')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'schedule'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays size={15} />
          מערכת חוזרת
          {scheduleDone && <span className="text-emerald-600 text-xs mr-1">✓</span>}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History size={15} />
          היסטוריה
          {historyDone && <span className="text-emerald-600 text-xs mr-1">✓</span>}
        </button>
      </div>

      {tab === 'schedule' && (
        <ImportFlow
          entityType="lessons-schedule"
          orgId={orgId}
          onComplete={(count) => {
            setScheduleDone(true)
            onCountChange(count)
          }}
        />
      )}
      {tab === 'history' && (
        <ImportFlow
          entityType="lessons-history"
          orgId={orgId}
          onComplete={(count) => {
            setHistoryDone(true)
            onCountChange(count)
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
