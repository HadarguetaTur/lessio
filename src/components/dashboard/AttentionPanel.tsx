import Link from 'next/link'
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Receipt,
  TriangleAlert,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { AttentionData } from '@/lib/dashboard/attention'
import type { AppLocale } from '@/lib/i18n/locale'
import { toIntlLocale } from '@/lib/i18n/locale'
import { cn } from '@/lib/utils'

interface AttentionPanelProps {
  data: AttentionData
  timezone: string
  appLocale: AppLocale
}

function GroupHeader({
  icon: Icon,
  label,
  href,
  trailing,
}: {
  icon: LucideIcon
  label: string
  href: string
  trailing?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs font-semibold text-foreground transition-colors hover:text-primary"
    >
      <Icon size={14} className="shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {trailing && <span className="text-muted-foreground font-medium">{trailing}</span>}
    </Link>
  )
}

/**
 * "Needs attention" — names and amounts, not bare counts.
 * Ordered by what it costs to ignore: an unlogged lesson never becomes a
 * charge, unapproved billing blocks the payment request, debtors owe money
 * already billed — then teaching follow-ups, pipeline and retention.
 * Navigation only: every row links to the page where the item is handled.
 */
export async function AttentionPanel({ data, timezone, appLocale }: AttentionPanelProps) {
  const t = await getTranslations('dashboard')
  const intlLocale = toIntlLocale(appLocale)

  const hasUnlogged = data.unloggedLessons.count > 0
  const hasPendingBilling = data.pendingBilling.count > 0
  const hasDebtors = data.debtors.count > 0
  const hasOverdueHomework = data.overdueHomework.count > 0
  const hasLeads = (data.newLeads?.count ?? 0) > 0
  const hasAtRisk = data.atRisk.count > 0
  const allClear =
    !hasUnlogged && !hasPendingBilling && !hasDebtors && !hasOverdueHomework && !hasLeads && !hasAtRisk

  const formatShortDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, day: 'numeric', month: 'short' }).format(
      new Date(iso)
    )

  const formatDayTime = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  const daysAgo = (iso: string) =>
    Math.max(0, Math.floor(DateTime.utc().diff(DateTime.fromISO(iso), 'days').days))

  return (
    <section aria-label={t('attention.title')}>
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t('attention.title')}</h2>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {allClear ? (
          <div className="flex items-center gap-2.5 px-4 py-5">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
            <p className="text-sm text-muted-foreground">{t('attention.allClear')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border pb-2">
            {hasUnlogged && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={BookOpen}
                  label={t('attention.unloggedLessons', { count: data.unloggedLessons.count })}
                  href="/lessons"
                />
                <ul>
                  {data.unloggedLessons.top.map((lesson) => (
                    <li key={lesson.lessonId}>
                      <Link
                        href={`/lessons/${lesson.lessonId}`}
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <bdi className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {lesson.studentName}
                        </bdi>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDayTime(lesson.startAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasPendingBilling && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={Receipt}
                  label={t('attention.pendingBilling', { count: data.pendingBilling.count })}
                  trailing={formatCurrency(data.pendingBilling.total, appLocale)}
                  href="/billing"
                />
                <ul>
                  {data.pendingBilling.top.map((row) => (
                    <li key={row.billingId}>
                      <Link
                        href="/billing"
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <bdi className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {row.studentName}
                        </bdi>
                        <span className="shrink-0 text-sm font-semibold text-foreground">
                          {formatCurrency(row.amount, appLocale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasDebtors && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={Wallet}
                  // No trailing total: the "still owed" card above owns that
                  // number, this group owns the list of who.
                  label={t('attention.debtors', { count: data.debtors.count })}
                  href="/billing/debts"
                />
                <ul>
                  {data.debtors.top.map((debtor) => (
                    <li key={debtor.parentId}>
                      <Link
                        href="/billing/debts"
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {debtor.parentName}
                          </span>
                          {debtor.childrenNames.length > 0 && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {debtor.childrenNames.join(', ')}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            debtor.oldestAgeDays >= 14
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {t('attention.daysOld', { days: debtor.oldestAgeDays })}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-foreground">
                          {formatCurrency(debtor.totalDebt, appLocale)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasOverdueHomework && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={ClipboardList}
                  label={t('attention.overdueHomework', { count: data.overdueHomework.count })}
                  href="/homework?status=overdue"
                />
                <ul>
                  {data.overdueHomework.top.map((row) => (
                    <li key={row.assignmentId}>
                      <Link
                        href={`/homework/${row.assignmentId}`}
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1">
                          <bdi className="block truncate text-sm text-foreground">
                            {row.studentName}
                          </bdi>
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.title}
                          </span>
                        </span>
                        {row.dueDate && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatShortDate(`${row.dueDate}T12:00:00Z`)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasLeads && data.newLeads && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={UserPlus}
                  label={t('attention.newLeads', { count: data.newLeads.count })}
                  href="/leads"
                />
                <ul>
                  {data.newLeads.top.map((lead) => (
                    <li key={lead.id}>
                      <Link
                        href="/leads"
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground" dir="ltr">
                            {lead.phone}
                          </span>
                          {lead.rawMessage && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {lead.rawMessage}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t('attention.daysOld', { days: daysAgo(lead.createdAt) })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasAtRisk && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={TriangleAlert}
                  label={t('attention.atRisk', { count: data.atRisk.count })}
                  href="/reports/students"
                />
                <ul>
                  {data.atRisk.top.map((student) => (
                    <li key={student.studentId}>
                      <Link
                        href={`/students/${student.studentId}`}
                        className="flex items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {student.studentName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {student.lastLessonAt
                            ? t('attention.lastLesson', { date: formatShortDate(student.lastLessonAt) })
                            : t('attention.noLesson')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
