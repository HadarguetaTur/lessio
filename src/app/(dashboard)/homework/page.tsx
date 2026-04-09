import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getAssignments } from '@/lib/homework'
import { getTranslations } from 'next-intl/server'
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
  const { orgId, role } = await getSession()
  const t = await getTranslations('homework')
  const tCommon = await getTranslations('common')

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return <div className="text-sm text-red-600">{t('noPermission')}</div>
  }

  const { status: rawStatus } = await searchParams
  const statusFilter = (['pending', 'done', 'overdue'] as string[]).includes(rawStatus ?? '')
    ? (rawStatus as Status)
    : undefined

  const assignments = await getAssignments(orgId, { status: statusFilter })

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
                  ? 'border border-primary/20 bg-primary/10 font-medium text-primary'
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
          <div className="h-full overflow-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{tCommon('table.student')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('fields.title')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('fields.dueDate')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{tCommon('table.status')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('columnSent')}</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted/95 px-4 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{t('columnCompleted')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id} className="hover:bg-muted/20">
                    <TableCell className="px-4 py-3 text-foreground">{a.studentName}</TableCell>
                    <TableCell className="max-w-xs px-4 py-3 text-foreground">
                      <div className="truncate">{a.title}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{a.dueDate ?? '—'}</TableCell>
                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[a.status]}`}
                      >
                        {STATUS_LABELS[a.status]}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {a.sentAt
                        ? new Date(a.sentAt).toLocaleDateString('he-IL')
                        : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {a.completedAt
                        ? new Date(a.completedAt).toLocaleDateString('he-IL')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
