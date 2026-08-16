'use client'

import { useState, useEffect } from 'react'
import { UserRound } from 'lucide-react'
import { getTeachersAction, type Teacher } from '@/app/book/[token]/actions'

interface TeacherSelectProps {
  token: string
  onSelect: (teacherId: string, teacherName: string) => void
  onError?: (errorCode: string) => void
  inline?: boolean
}

export function TeacherSelect({ token, onSelect, onError, inline }: TeacherSelectProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTeachersAction(token)
      .then(result => {
        if (result.success) {
          setTeachers(result.data)
        } else if (result.error === 'token_expired' && onError) {
          onError('token_expired')
        } else {
          setError('שגיאה בטעינת המורים. אנא נסה/י שוב.')
        }
      })
      .catch(() => setError('שגיאה בטעינת המורים. אנא נסה/י שוב.'))
      .finally(() => setLoading(false))
  }, [token, onError])

  const content = (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold text-foreground">עם איזה מורה תרצו לקבוע?</h1>
        <p className="text-sm text-muted-foreground">
          אחרי הבחירה נציג לכם את הזמינות הפנויה לשבוע הקרוב.
        </p>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm text-center">{error}</p>
      )}

      {!loading && !error && teachers.length === 0 && (
        <p className="text-muted-foreground text-sm text-center">
          כרגע אין מורים זמינים לקביעת שיעור.
        </p>
      )}

      {!loading && !error && teachers.length > 0 && (
        <ul className="space-y-2.5">
          {teachers.map(teacher => (
            <li key={teacher.id}>
              <button
                onClick={() => onSelect(teacher.id, teacher.display_name)}
                className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 text-right hover:bg-accent hover:border-primary/30 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserRound size={18} className="text-primary" />
                </div>
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {teacher.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  if (inline) {
    return content
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-5 pt-10">{content}</div>
    </main>
  )
}
