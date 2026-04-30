'use client'

import { useState } from 'react'
import { BookOpen, Target, StickyNote, CheckCircle } from 'lucide-react'

type StudentProgress = {
  studentId: string
  studentName: string
  attendance: { attended: number; total: number; rate: number }
  homework: { completed: number; total: number; rate: number; avgScore: number | null }
  goals: Array<{ id: string; subject: string; description: string; status: string; targetDate: string | null }>
  notes: Array<{ id: string; body: string; teacherName: string; lessonDate: string }>
  monthlySummary: { lessons: number; homeworkDone: number }
}

interface Props {
  progress30: StudentProgress[]
  progress90: StudentProgress[]
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  achieved: 'הושג',
  abandoned: 'נזנח',
}

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700',
  achieved: 'bg-green-50 text-green-700',
  abandoned: 'bg-gray-100 text-gray-500',
}

function ProgressBar({ rate }: { rate: number }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all"
        style={{ width: `${Math.min(rate, 100)}%` }}
      />
    </div>
  )
}

export function PortalProgressView({ progress30, progress90 }: Props) {
  const [period, setPeriod] = useState<30 | 90>(30)
  const progressData = period === 30 ? progress30 : progress90

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setPeriod(30)}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            period === 30 ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          30 ימים
        </button>
        <button
          onClick={() => setPeriod(90)}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            period === 90 ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          90 ימים
        </button>
      </div>

      {progressData.map((student) => (
        <div key={student.studentId} className="space-y-3">
          {/* Student name header (only if multiple students) */}
          {progressData.length > 1 && (
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {student.studentName}
            </p>
          )}

          {/* Monthly summary */}
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
            <p className="text-sm text-foreground">
              <span className="font-semibold">החודש:</span>{' '}
              {student.monthlySummary.lessons} שיעורים, {student.monthlySummary.homeworkDone} משימות הושלמו
            </p>
          </div>

          {/* Attendance card */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <BookOpen size={13} />
                נוכחות
              </p>
              <p className="text-xs font-medium text-foreground">{student.attendance.rate}%</p>
            </div>
            <ProgressBar rate={student.attendance.rate} />
            <p className="text-xs text-muted-foreground">
              {student.attendance.attended} מתוך {student.attendance.total} שיעורים
            </p>
          </div>

          {/* Homework card */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <CheckCircle size={13} />
                שיעורי בית
              </p>
              <p className="text-xs font-medium text-foreground">{student.homework.rate}%</p>
            </div>
            <ProgressBar rate={student.homework.rate} />
            <p className="text-xs text-muted-foreground">
              {student.homework.completed} מתוך {student.homework.total} משימות
              {student.homework.avgScore != null && (
                <span> · ממוצע ציון: {student.homework.avgScore}</span>
              )}
            </p>
          </div>

          {/* Goals */}
          {student.goals.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Target size={13} />
                יעדי למידה
              </p>
              <div className="space-y-2">
                {student.goals.map((goal) => (
                  <div key={goal.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-muted-foreground">{goal.subject}</span>
                      <p className="text-sm text-foreground">{goal.description}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_CLASS[goal.status] ?? ''}`}>
                      {STATUS_LABEL[goal.status] ?? goal.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Teacher notes */}
          {student.notes.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <StickyNote size={13} />
                הערות מורה
              </p>
              <div className="space-y-2">
                {student.notes.map((note) => (
                  <div key={note.id} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-sm text-foreground">{note.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {note.teacherName}{note.lessonDate && ` · ${note.lessonDate}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
