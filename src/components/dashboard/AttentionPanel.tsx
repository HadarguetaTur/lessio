import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Receipt,
  TriangleAlert,
  UserPlus,
} from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import type { AttentionData } from '@/lib/dashboard/attention'
import type { AppLocale } from '@/lib/i18n/locale'
import { toIntlLocale } from '@/lib/i18n/locale'
import { cn } from '@/lib/utils'
import { AttentionCard, AttentionRow, AttentionSubHeader } from './AttentionCard'

interface AttentionPanelProps {
  data: AttentionData
  timezone: string
  appLocale: AppLocale
}

/** Rows rendered inside a card before the view-all link takes over. */
const ROW_LIMIT = 4
/** Per bucket when the billing card carries both approval and debt. */
const SPLIT_LIMIT = 2

/**
 * "Needs attention" — names and amounts, not bare counts.
 *
 * Laid out as a row of equal-height cards under today's lessons so everything
 * that needs a decision is scannable at a glance. Buckets keep their old
 * priority (an unlogged lesson never becomes a charge → money → teaching
 * follow-ups → pipeline and retention); money is one card because approval and
 * debt are the same errand. Navigation only: every row links to the page where
 * the item is handled.
 */
export async function AttentionPanel({
  data,
  timezone,
  appLocale,
  hasStudents = true,
}: AttentionPanelProps & { hasStudents?: boolean }) {
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

  const openItems =
    data.unloggedLessons.count +
    data.pendingBilling.count +
    data.debtors.count +
    data.overdueHomework.count +
    (data.newLeads?.count ?? 0) +
    data.atRisk.count

  if (allClear) {
    return (
      <section aria-label={t('attention.title')}>
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('attention.title')}</h2>
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-5 shadow-sm">
          <CheckCircle2
            size={18}
            className={`shrink-0 ${hasStudents ? 'text-emerald-500' : 'text-muted-foreground'}`}
          />
          <p className="text-sm text-muted-foreground">
            {hasStudents ? t('attention.allClear') : t('attention.nothingYet')}
          </p>
        </div>
      </section>
    )
  }

  // Billing card carries two buckets — halve each so the card stays the height
  // of its neighbours instead of stacking eight rows.
  const billingCount = data.pendingBilling.count + data.debtors.count
  const billingSplit = hasPendingBilling && hasDebtors
  const billingLimit = billingSplit ? SPLIT_LIMIT : ROW_LIMIT
  const pendingShown = data.pendingBilling.top.slice(0, billingLimit)
  const debtorsShown = data.debtors.top.slice(0, billingLimit)

  return (
    <section aria-label={t('attention.title')}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-base font-semibold text-foreground">{t('attention.title')}</h2>
        <span className="text-xs text-muted-foreground">
          {t('attention.openItems', { count: openItems })}
        </span>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1 — unlogged lessons: nothing auto-completes a lesson, and an
            un-completed lesson never becomes a charge. */}
        <AttentionCard
          icon={BookOpen}
          tone="amber"
          title={t('attention.cards.unloggedLessons')}
          count={data.unloggedLessons.count}
          href="/lessons"
          hasMore={data.unloggedLessons.count > ROW_LIMIT}
          viewAllLabel={t('attention.viewAll')}
          emptyLabel={t('attention.sectionClear')}
        >
          {data.unloggedLessons.top.slice(0, ROW_LIMIT).map((lesson) => (
            <AttentionRow
              key={lesson.lessonId}
              href={`/lessons/${lesson.lessonId}`}
              primary={<bdi>{lesson.studentName}</bdi>}
              trailing={formatDayTime(lesson.startAt)}
            />
          ))}
        </AttentionCard>

        {/* 2 — money: billing awaiting approval blocks the payment request,
            debtors already owe. Same errand, one card. */}
        <AttentionCard
          icon={Receipt}
          tone="rose"
          title={t('attention.cards.billing')}
          count={billingCount}
          href="/billing"
          hasMore={
            data.pendingBilling.count > pendingShown.length ||
            data.debtors.count > debtorsShown.length
          }
          viewAllLabel={t('attention.viewAll')}
          emptyLabel={t('attention.sectionClear')}
        >
          {hasPendingBilling && (
            <>
              <AttentionSubHeader
                label={t('attention.pendingApproval')}
                href="/billing"
                trailing={formatCurrency(data.pendingBilling.total, appLocale)}
              />
              {pendingShown.map((row) => (
                <AttentionRow
                  key={row.billingId}
                  href="/billing"
                  primary={<bdi>{row.studentName}</bdi>}
                  trailing={formatCurrency(row.amount, appLocale)}
                  trailingStrong
                />
              ))}
            </>
          )}

          {hasDebtors && (
            <>
              {/* No trailing total: the "still owed" KPI below owns that
                  number, this bucket owns the list of who. */}
              <AttentionSubHeader label={t('attention.debtorsLabel')} href="/billing/debts" />
              {debtorsShown.map((debtor) => (
                <AttentionRow
                  key={debtor.parentId}
                  href="/billing/debts"
                  primary={<bdi>{debtor.parentName}</bdi>}
                  secondary={
                    debtor.childrenNames.length > 0 ? debtor.childrenNames.join(', ') : undefined
                  }
                  badge={
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
                  }
                  trailing={formatCurrency(debtor.totalDebt, appLocale)}
                  trailingStrong
                />
              ))}
            </>
          )}
        </AttentionCard>

        {/* 3 — teaching follow-ups. */}
        <AttentionCard
          icon={ClipboardList}
          tone="violet"
          title={t('attention.cards.overdueHomework')}
          count={data.overdueHomework.count}
          href="/homework?status=overdue"
          hasMore={data.overdueHomework.count > ROW_LIMIT}
          viewAllLabel={t('attention.viewAll')}
          emptyLabel={t('attention.sectionClear')}
        >
          {data.overdueHomework.top.slice(0, ROW_LIMIT).map((row) => (
            <AttentionRow
              key={row.assignmentId}
              href={`/homework/${row.assignmentId}`}
              primary={<bdi>{row.studentName}</bdi>}
              secondary={row.title}
              trailing={row.dueDate ? formatShortDate(`${row.dueDate}T12:00:00Z`) : undefined}
            />
          ))}
        </AttentionCard>

        {/* 4/5 — pipeline and retention wrap onto the next row of the same
            grid, so they keep the card rhythm instead of a second layout. */}
        {hasLeads && data.newLeads && (
          <AttentionCard
            icon={UserPlus}
            tone="blue"
            title={t('attention.cards.newLeads')}
            count={data.newLeads.count}
            href="/leads"
            hasMore={data.newLeads.count > ROW_LIMIT}
            viewAllLabel={t('attention.viewAll')}
            emptyLabel={t('attention.sectionClear')}
          >
            {data.newLeads.top.slice(0, ROW_LIMIT).map((lead) => (
              <AttentionRow
                key={lead.id}
                href="/leads"
                primary={<span dir="ltr">{lead.phone}</span>}
                secondary={lead.rawMessage || undefined}
                trailing={t('attention.daysOld', { days: daysAgo(lead.createdAt) })}
              />
            ))}
          </AttentionCard>
        )}

        {hasAtRisk && (
          <AttentionCard
            icon={TriangleAlert}
            tone="amber"
            title={t('attention.cards.atRisk')}
            count={data.atRisk.count}
            href="/reports/students"
            hasMore={data.atRisk.count > ROW_LIMIT}
            viewAllLabel={t('attention.viewAll')}
            emptyLabel={t('attention.sectionClear')}
          >
            {data.atRisk.top.slice(0, ROW_LIMIT).map((student) => (
              <AttentionRow
                key={student.studentId}
                href={`/students/${student.studentId}`}
                primary={<bdi>{student.studentName}</bdi>}
                trailing={
                  student.lastLessonAt
                    ? t('attention.lastLesson', { date: formatShortDate(student.lastLessonAt) })
                    : t('attention.noLesson')
                }
              />
            ))}
          </AttentionCard>
        )}
      </div>
    </section>
  )
}
