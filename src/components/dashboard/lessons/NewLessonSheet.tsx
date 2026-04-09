'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { CalendarPlus } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'
import { createLessonAction } from '@/app/(dashboard)/lessons/new/actions'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import type { StudentGroup } from '@/lib/groups'

export interface NewLessonSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  minDateStr: string
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
  groups: StudentGroup[]
  defaultTeacherId?: string
}

export function NewLessonSheet({
  open,
  onOpenChange,
  initialDate,
  minDateStr,
  teachers,
  students,
  groups,
  defaultTeacherId,
}: NewLessonSheetProps) {
  const router = useRouter()
  const t = useTranslations('lessons')
  const locale = useLocale()
  const intl = toIntlLocale(parseAppLocale(locale))

  const subtitle = (() => {
    try {
      return new Date(`${initialDate}T12:00:00Z`).toLocaleDateString(intl, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    } catch {
      return ''
    }
  })()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-full sm:max-w-none sm:w-[580px] h-[100dvh] max-h-[100dvh] sm:h-full sm:max-h-none p-0 flex flex-col gap-0 rounded-none border-0 sm:border-l"
        dir="rtl"
      >
        <SheetTitle className="sr-only">{t('newLessonTitle')}</SheetTitle>

        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border bg-muted/20">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarPlus className="size-7" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-lg font-bold text-foreground leading-tight">{t('newLessonTitle')}</h2>
              {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {open ? (
            <NewLessonForm
              key={`${initialDate}-${defaultTeacherId ?? ''}`}
              students={students}
              groups={groups}
              teachers={teachers}
              action={createLessonAction}
              minDateStr={minDateStr}
              initialDate={initialDate}
              defaultTeacherId={defaultTeacherId}
              calendarFlow
              variant="sheet"
              onCancel={() => onOpenChange(false)}
              onSuccess={() => {
                router.refresh()
                onOpenChange(false)
              }}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
