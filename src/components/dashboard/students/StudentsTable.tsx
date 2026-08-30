'use client'

import { useEffect, useMemo, useState } from 'react'
import { Archive, RotateCcw, MoreHorizontal, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StudentDetailSheet } from './StudentDetailSheet'

export function getStudentStatusBadge(
  status: Student['status'],
  t: (key: string) => string,
): { label: string; className: string } {
  const STATUS_BADGE: Record<Student['status'], { label: string; className: string }> = {
    active:   { label: t('status.active'),    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    on_hold:  { label: t('status.on_hold'),   className: 'bg-amber-50 text-amber-700 border-amber-200' },
    inactive: { label: t('status.inactive'),  className: 'bg-slate-100 text-slate-500 border-slate-200' },
  }

  return STATUS_BADGE[status] ?? STATUS_BADGE.inactive
}
import { archiveStudent, restoreStudent } from '@/app/(dashboard)/students/actions'
import { cn } from '@/lib/utils'
import type { Student } from '@/lib/students'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface StudentsTableProps {
  students: Student[]
  teachers: { id: string; full_name: string }[]
  tStudent: string
  tGrade: string
  tStatus: string
  /** When set (e.g. from ?openStudent=), opens the detail sheet for this student even if not in the current table rows. */
  initialSheetStudent?: Student | null
  canManage?: boolean
  sheetVariant?: 'admin' | 'teacher'
  showArchiveActions?: boolean
  /** Hidden when the org does not enforce the weekly quota. */
  showWeeklyQuota?: boolean
}

export function StudentsTable({
  students,
  teachers,
  tStudent,
  tGrade,
  tStatus,
  initialSheetStudent = null,
  canManage,
  sheetVariant = 'admin',
  showArchiveActions = true,
  showWeeklyQuota = true,
}: StudentsTableProps) {
  const t = useTranslations('students')
  const tHeaderCommon = useTranslations('common')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (initialSheetStudent?.id) {
      setSelectedStudentId(initialSheetStudent.id)
      setSheetOpen(true)
    }
  }, [initialSheetStudent?.id])

  const selectedStudent = useMemo(() => {
    if (!selectedStudentId) return null
    return (
      students.find((student) => student.id === selectedStudentId) ??
      (initialSheetStudent?.id === selectedStudentId ? initialSheetStudent : null)
    )
  }, [selectedStudentId, students, initialSheetStudent])

  const handleRowClick = (student: Student) => {
    setSelectedStudentId(student.id)
    setSheetOpen(true)
  }

  return (
    <>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="hidden h-full overflow-auto md:block">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tStudent}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tGrade}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tStatus}
                </TableHead>
                <TableHead className="sticky top-0 z-10 w-12 bg-muted/95 px-5 backdrop-blur">
                  <span className="sr-only">{tHeaderCommon('table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const badge = getStudentStatusBadge(student.status, t)
                return (
                  <TableRow
                    key={student.id}
                    onClick={() => handleRowClick(student)}
                    className="cursor-pointer hover:bg-muted/20"
                  >
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={student.full_name} />
                        {/* A real link: keyboard users get a path to the student
                            (the row's onClick is mouse-only), and the name reads
                            as clickable. Clicking elsewhere still opens the sheet. */}
                        <Link
                          href={`/students/${student.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {student.full_name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-sm text-muted-foreground">
                      {student.grade ?? <span className="text-border">—</span>}
                    </TableCell>
                    <TableCell className="px-5 py-3.5">
                      <span className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                        badge.className
                      )}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell
                      className="px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {showArchiveActions ? <RowActions student={student} /> : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 p-3 md:hidden">
          {students.map((student) => {
            const badge = getStudentStatusBadge(student.status, t)
            return (
              // A div with button semantics, not a <button>: the ⋯ actions menu
              // renders inside the card, and a button may not contain a button
              // (React 19 warns and it breaks hydration).
              <div
                key={student.id}
                role="button"
                tabIndex={0}
                onClick={() => handleRowClick(student)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleRowClick(student)
                  }
                }}
                className="cursor-pointer rounded-xl border border-border bg-card p-3 text-start shadow-sm transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <UserAvatar name={student.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {student.full_name}
                      </p>
                      {student.grade ? (
                        <p className="text-xs text-muted-foreground">{student.grade}</p>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                    badge.className
                  )}>
                    {badge.label}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{tStatus}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{badge.label}</span>
                    {showArchiveActions ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                        className="inline-flex"
                      >
                        <RowActions student={student} />
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <StudentDetailSheet
        student={selectedStudent}
        teachers={teachers}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canManage={canManage}
        variant={sheetVariant}
        showWeeklyQuota={showWeeklyQuota}
      />
    </>
  )
}

function RowActions({ student }: { student: Student }) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')

  const handleArchive = async () => {
    await archiveStudent(student.id)
  }
  const handleRestore = async () => {
    await restoreStudent(student.id)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center p-1.5 max-lg:min-h-11 max-lg:min-w-11 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label={tCommon('table.actions')}
        >
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <Link href={`/students/${student.id}/edit`}>
            <Pencil size={13} className="ml-2" />
            {tCommon('actions.edit')}
          </Link>
        </DropdownMenuItem>
        {student.status !== 'inactive' ? (
          <DropdownMenuItem
            onSelect={handleArchive}
            className="text-destructive focus:text-destructive"
          >
            <Archive size={13} className="ml-2" />
            {t('archive')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={handleRestore} className="text-emerald-700">
            <RotateCcw size={13} className="ml-2" />
            {t('restore')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
