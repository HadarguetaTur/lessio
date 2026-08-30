import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getAssignments } from '@/lib/homework'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Homework list page — shows all assignments for the org.
 * Per /docs/sprint-14-scope.md § Story 5.
 */

type Status = 'pending' | 'done' | 'overdue'

const STATUS_CLASSES: Record<Status, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  done:    'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
}

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { orgId, role, userId } = await getSession()
  const t = await getTranslations('homework')
  const tCommon = await getTranslations('common')
  const intlLocale = toIntlLocale(parseAppLocale(await getLocale()))

  // Due dates arrived as raw YYYY-MM-DD next to columns formatted for a
  // reader; noon avoids the date shifting a day either way across timezones.
  const formatDay = (value: string | null | undefined) =>
    value ? new Date(`${value}T12:00:00Z`).toLocaleDateString(intlLocale) : '—'
  const formatStamp = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString(intlLocale) : '—'

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">{t('noPermission')}</div>
  }

  const { status: rawStatus } = await searchParams
  const statusFilter = (['pending', 'done', 'overdue'] as string[]).includes(rawStatus ?? '')
    ? (rawStatus as Status)
    : undefined

  let teacherIdFilter: string | undefined
  if (role === 'teacher') {
    const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
    teacherIdFilter = teacher?.id
  }

  const assignments = await getAssignments(orgId, { status: statusFilter, teacherId: teacherIdFilter })

  // Fetch submission counts per assignment for completion rate column
  const assignmentIds = assignments.map((a) => a.id)
  const submissionCounts = new Map<string, { total: number; graded: number }>()
  if (assignmentIds.length > 0) {
    const db = createServiceRoleClient()
    const { data: subs } = await db
      .from('homework_submissions')
      .select('assignment_id, score')
      .eq('organization_id', orgId)
      .in('assignment_id', assignmentIds)

    for (const sub of subs ?? []) {
      const row = sub as { assignment_id: string; score: number | null }
      const entry = submissionCounts.get(row.assignment_id) ?? { total: 0, graded: 0 }
      entry.total++
      if (row.score != null) entry.graded++
      submissionCounts.set(row.assignment_id, entry)
    }
  }

  const STATUS_LABELS: Record<Status, string> = {
    pending: tCommon('homeworkStatus.pending'),
    done:    tCommon('homeworkStatus.done'),
    overdue: tCommon('homeworkStatus.overdue'),
  }

  const FILTERS: Array<{ label: string; value: Status | undefined }> = [
    { label: t('filterAll'),     value: undefined },
    { label: STATUS_LABELS.pending,   value: 'pending' },
    { label: STATUS_LABELS.done,   value: 'done' },
    { label: STATUS_LABELS.overdue,  value: 'overdue' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/homework/templates">{t('templates')}</Link>
            </Button>
            <Button asChild>
              <Link href="/homework/assign">+ {t('assign')}</Link>
            </Button>
          </div>
        }
      />

      {/* Status filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(({ label, value }) => {
          const active = statusFilter === value
          return (
            <Link
              key={label}
              href={value ? `/homework?status=${value}` : '/homework'}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                active
                  ? 'border border-blue-200 bg-blue-50 font-medium text-blue-700'
                  : 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('noAssignments')}
          action={
            <Button asChild>
              <Link href="/homework/assign">{t('assign')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="hidden h-full overflow-auto md:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{tCommon('table.student')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('fields.title')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('fields.dueDate')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{tCommon('table.status')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('columnSent')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('columnCompleted')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('completionRate')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const counts = submissionCounts.get(a.id)
                  const completionLabel = counts
                    ? `${counts.graded}/${counts.total}`
                    : '—'
                  return (
                    <TableRow key={a.id} className="hover:bg-muted/20">
                      <TableCell className="px-4 py-3 text-foreground">{a.studentName}</TableCell>
                      <TableCell className="max-w-xs px-4 py-3 text-foreground">
                        <Link href={`/homework/${a.id}`} className="truncate text-primary hover:underline">
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{formatDay(a.dueDate)}</TableCell>
                      <TableCell className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[a.status]}`}
                        >
                          {STATUS_LABELS[a.status]}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                        {formatStamp(a.sentAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                        {formatStamp(a.completedAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                        {completionLabel}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 p-3 md:hidden">
            {assignments.map((a) => {
              const counts = submissionCounts.get(a.id)
              const completionLabel = counts ? `${counts.graded}/${counts.total}` : '—'
              return (
                <Link
                  key={a.id}
                  href={`/homework/${a.id}`}
                  className="rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{a.studentName}</p>
                      <p className="mt-1 text-sm text-primary">{a.title}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </div>

                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2">
                      <dt className="col-start-2 text-end text-muted-foreground">{t('fields.dueDate')}</dt>
                      <dd className="col-start-1 font-medium text-foreground" dir="ltr">
                        {formatDay(a.dueDate)}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2">
                      <dt className="col-start-2 text-end text-muted-foreground">{t('columnSent')}</dt>
                      <dd className="col-start-1 text-muted-foreground" dir="ltr">
                        {formatStamp(a.sentAt)}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2">
                      <dt className="col-start-2 text-end text-muted-foreground">{t('completionRate')}</dt>
                      <dd className="col-start-1 text-muted-foreground" dir="ltr">
                        {completionLabel}
                      </dd>
                    </div>
                  </dl>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
