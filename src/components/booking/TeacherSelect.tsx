'use client'

import { useState, useEffect } from 'react'
import { getTeachersAction, type Teacher } from '@/app/book/[token]/actions'

interface TeacherSelectProps {
  token: string
  onSelect: (teacherId: string, teacherName: string) => void
}

export function TeacherSelect({ token, onSelect }: TeacherSelectProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTeachersAction(token)
      .then(setTeachers)
      .catch(() => setError('שגיאה בטעינת המורים. אנא נסה/י שוב.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <PageShell>
        <p className="text-muted-foreground text-sm text-center">טוען מורים...</p>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <p className="text-destructive text-sm text-center">{error}</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <h1 className="text-lg font-semibold text-center">בחר/י מורה</h1>
      {teachers.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center">אין מורים זמינים כרגע.</p>
      ) : (
        <ul className="space-y-3">
          {teachers.map(teacher => (
            <li key={teacher.id}>
              <button
                onClick={() => onSelect(teacher.id, teacher.display_name)}
                className="w-full rounded-xl border border-border bg-card p-4 text-right font-medium hover:bg-accent transition-colors"
              >
                {teacher.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-5 pt-10">{children}</div>
    </main>
  )
}
