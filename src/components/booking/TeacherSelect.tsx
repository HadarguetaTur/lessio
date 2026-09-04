'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { UserRound } from 'lucide-react'
import { getTeachersAction, type Teacher } from '@/app/book/[token]/actions'

interface TeacherSelectProps {
  token: string
  /** `wasOnlyTeacher` is true when the step auto-advanced on a single-entry
   *  list (assigned teacher, or a one-teacher org) — the caller should not
   *  offer a "back" into this step, which would immediately bounce forward. */
  onSelect: (teacherId: string, teacherName: string, wasOnlyTeacher?: boolean) => void
  onError?: (errorCode: string) => void
  inline?: boolean
}

export function TeacherSelect({ token, onSelect, onError, inline }: TeacherSelectProps) {
  const t = useTranslations('booking.teacher')
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    getTeachersAction(token)
      .then(result => {
        if (result.success) {
          if (result.data.length === 1) {
            const only = result.data[0]
            onSelect(only.id, only.display_name, true)
            return
          }
          setTeachers(result.data)
        } else if (result.error === 'token_expired' && onError) {
          onError('token_expired')
        } else {
          setHasError(true)
        }
      })
      .catch(() => setHasError(true))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelect identity is not stable in the parent; re-fetching on it would loop
  }, [token, onError])

  const content = (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {hasError && (
        <p className="text-destructive text-sm text-center">{t('loadError')}</p>
      )}

      {!loading && !hasError && teachers.length === 0 && (
        <p className="text-muted-foreground text-sm text-center">{t('empty')}</p>
      )}

      {!loading && !hasError && teachers.length > 0 && (
        <ul className="space-y-2.5">
          {teachers.map(teacher => (
            <li key={teacher.id}>
              <button
                onClick={() => onSelect(teacher.id, teacher.display_name)}
                className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 text-start hover:bg-accent hover:border-primary/30 transition-all group"
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
