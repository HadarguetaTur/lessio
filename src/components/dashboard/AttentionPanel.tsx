import Link from 'next/link'
import { CheckCircle2, TriangleAlert, UserPlus, Wallet, type LucideIcon } from 'lucide-react'
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
 * Priority: money (debtors) → pipeline (new leads) → retention (at-risk students).
 * Navigation only: every row links to the page where the item is handled.
 */
export async function AttentionPanel({ data, timezone, appLocale }: AttentionPanelProps) {
  const t = await getTranslations('dashboard')
  const intlLocale = toIntlLocale(appLocale)

  const hasDebtors = data.debtors.count > 0
  const hasLeads = (data.newLeads?.count ?? 0) > 0
  const hasAtRisk = data.atRisk.count > 0
  const allClear = !hasDebtors && !hasLeads && !hasAtRisk

  const formatShortDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, day: 'numeric', month: 'short' }).format(
      new Date(iso)
    )

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
            {hasDebtors && (
              <div className="pb-1.5">
                <GroupHeader
                  icon={Wallet}
                  label={t('attention.debtors', { count: data.debtors.count })}
                  trailing={formatCurrency(data.debtors.totalDebt, appLocale)}
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
