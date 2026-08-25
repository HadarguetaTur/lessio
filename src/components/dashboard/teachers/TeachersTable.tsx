'use client'

import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TeacherDetailSheet } from './TeacherDetailSheet'
import { TeacherRowActions } from './TeacherSheet'
import { cn } from '@/lib/utils'
import type { Teacher } from '@/lib/teachers'

type ActionState = { error: string } | null
type UnboundUpdateAction = (id: string, prevState: ActionState, formData: FormData) => Promise<ActionState>
type UnboundVoidAction = (id: string) => Promise<void>

interface TeachersTableProps {
  teachers: Teacher[]
  role: 'owner' | 'admin' | 'teacher'
  headingName: string
  headingBio: string
  headingStatus: string
  statusActiveLabel: string
  statusInactiveLabel: string
  updateAction: UnboundUpdateAction
  archiveAction: UnboundVoidAction
  restoreAction: UnboundVoidAction
}

const IGNORE_SELECTOR = '[data-teacher-row-ignore-click]'

export function TeachersTable({
  teachers,
  role,
  headingName,
  headingBio,
  headingStatus,
  statusActiveLabel,
  statusInactiveLabel,
  updateAction,
  archiveAction,
  restoreAction,
}: TeachersTableProps) {
  const tActions = useTranslations('common')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined)
  const [sheetOpen, setSheetOpen] = useState(false)

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>, teacher: Teacher) {
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    setSelectedId(teacher.id)
    setSelectedName(teacher.profile.full_name)
    setSheetOpen(true)
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, teacher: Teacher) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    e.preventDefault()
    setSelectedId(teacher.id)
    setSelectedName(teacher.profile.full_name)
    setSheetOpen(true)
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full overflow-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingName}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingBio}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingStatus}
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-12 bg-muted/95 px-5 backdrop-blur">
                  <span className="sr-only">{tActions('table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.map((teacher) => {
                const boundUpdate: (prevState: ActionState, formData: FormData) => Promise<ActionState> =
                  (prevState, formData) => updateAction(teacher.id, prevState, formData)
                const boundArchive = () => archiveAction(teacher.id)
                const boundRestore = () => restoreAction(teacher.id)
                return (
                  <TableRow
                    key={teacher.id}
                    onClick={(e) => handleRowClick(e, teacher)}
                    onKeyDown={(e) => handleRowKeyDown(e, teacher)}
                    tabIndex={0}
                    aria-label={teacher.profile.full_name}
                    className={cn(
                      'hover:bg-muted/20 cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    )}
                  >
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={teacher.profile.full_name} />
                        <span className="text-sm font-medium text-foreground">
                          {teacher.profile.full_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs px-5 py-3.5 text-sm text-muted-foreground">
                      <div className="truncate">
                        {teacher.bio ?? <span className="text-border">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                          teacher.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-muted text-muted-foreground border-border',
                        )}
                      >
                        {teacher.is_active
                          ? statusActiveLabel
                          : statusInactiveLabel}
                      </span>
                    </TableCell>
                    <TableCell
                      className="px-5 py-3.5"
                      data-teacher-row-ignore-click
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TeacherRowActions
                        teacher={{
                          id: teacher.id,
                          profileName: teacher.profile.full_name,
                          bio: teacher.bio,
                          hourly_rate: teacher.hourly_rate,
                          is_active: teacher.is_active,
                        }}
                        updateAction={boundUpdate}
                        archiveAction={boundArchive}
                        restoreAction={boundRestore}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <TeacherDetailSheet
        teacherId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        role={role}
        initialName={selectedName}
      />
    </>
  )
}
