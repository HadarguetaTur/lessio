'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TEACHER_COLOR_CLASSES, type TeacherColorKey } from '@/lib/teachers/color'
import { cn } from '@/lib/utils'
import { withTeacherParam } from './calendarParams'

export interface TeacherPickerOption {
  id: string
  full_name: string
  colorKey: TeacherColorKey
}

interface CalendarTeacherPickerProps {
  teachers: TeacherPickerOption[]
  /** The teacher the server rendered the calendar for. Undefined = everyone. */
  teacherId?: string
}

/** Above this many teachers the chip row stops fitting and the select takes over. */
const CHIP_LIMIT = 8

/**
 * The one teacher filter for every calendar view.
 *
 * The filter lives in the URL, so picking a teacher is a navigation. The old
 * controls re-rendered with the *previous* server value the moment the user
 * chose, then rebuilt themselves once the round trip landed — on a slow
 * connection the choice visibly snapped back and every retry restarted the
 * navigation. Here the chosen value is shown immediately, the control is
 * inert until the navigation settles, and the URL keeps every other param.
 */
export function CalendarTeacherPicker({ teachers, teacherId }: CalendarTeacherPickerProps) {
  const t = useTranslations('lessons')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<string | null>(null)

  // While the navigation is in flight the choice is shown; once it lands the
  // server prop is the truth again and the stale optimistic value is ignored.
  const selected = isPending && optimistic !== null ? optimistic : (teacherId ?? '')

  function choose(id: string) {
    if (isPending || id === (teacherId ?? '')) return
    setOptimistic(id)
    startTransition(() => {
      router.push(withTeacherParam(searchParams, id || null))
    })
  }

  const useChips = teachers.length <= CHIP_LIMIT
  const label = t('teacherFilter')
  const busyLabel = t('teacherFilterPending')

  return (
    <div
      className="flex w-full min-w-0 justify-center sm:w-auto sm:justify-start"
      aria-busy={isPending || undefined}
    >
      {/* Chips: desktop, small rosters. `hidden` keeps the unused control out of the
          accessibility tree, so a screen reader meets one filter, not two. */}
      <div
        role="group"
        aria-label={label}
        className={cn(
          'flex-wrap items-center gap-1.5',
          useChips ? 'hidden sm:flex' : 'hidden',
          isPending && 'pointer-events-none opacity-70'
        )}
      >
        <Chip active={selected === ''} onClick={() => choose('')} disabled={isPending}>
          {t('allTeachers')}
        </Chip>
        {teachers.map((teacher) => {
          const colors = TEACHER_COLOR_CLASSES[teacher.colorKey]
          const active = selected === teacher.id
          return (
            <Chip
              key={teacher.id}
              active={active}
              activeClass={colors.chipActive}
              onClick={() => choose(teacher.id)}
              disabled={isPending}
            >
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', colors.dot)} />
              <span className="truncate">{teacher.full_name}</span>
            </Chip>
          )
        })}
        {isPending && <span className="sr-only" role="status">{busyLabel}</span>}
      </div>

      {/* Select: mobile, and any roster too long for chips. */}
      <select
        value={selected}
        onChange={(e) => choose(e.target.value)}
        disabled={isPending}
        aria-label={label}
        className={cn(
          'mx-auto w-full min-w-0 max-w-xs rounded-md border border-input bg-background px-2 py-1.5 text-center text-sm text-foreground disabled:cursor-wait disabled:opacity-70 sm:mx-0 sm:w-auto sm:text-start',
          useChips ? 'sm:hidden' : ''
        )}
      >
        <option value="">{t('allTeachers')}</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.full_name}
          </option>
        ))}
      </select>
    </div>
  )
}

function Chip({
  active,
  activeClass,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  activeClass?: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-44 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        active
          ? (activeClass ?? 'border-foreground bg-foreground text-background')
          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
