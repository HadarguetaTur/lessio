'use client'

import { useTranslations } from 'next-intl'

interface QuotaUsageBarsProps {
  studentsUsed: number
  studentsLimit: number | null
  lessonsUsed: number
  lessonsLimit: number | null
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const t = useTranslations('quota')
  const pct = Math.min((used / limit) * 100, 100)
  const isWarning = pct >= 80
  const isOver = pct >= 100

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-sidebar-foreground/50">{label}</span>
        <span className={`font-medium ${isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-sidebar-foreground/60'}`}>
          {used} {t('of')} {limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-sidebar-foreground/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOver ? 'bg-red-400' : isWarning ? 'bg-amber-400' : 'bg-sidebar-primary/60'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function QuotaUsageBars({ studentsUsed, studentsLimit, lessonsUsed, lessonsLimit }: QuotaUsageBarsProps) {
  const t = useTranslations('quota')

  if (!studentsLimit && !lessonsLimit) return null

  return (
    <div className="px-3 py-2 space-y-2">
      <p className="text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest">
        {t('usage')}
      </p>
      {studentsLimit != null && (
        <UsageBar used={studentsUsed} limit={studentsLimit} label={t('studentsLimit')} />
      )}
      {lessonsLimit != null && (
        <UsageBar used={lessonsUsed} limit={lessonsLimit} label={t('lessonsLimit')} />
      )}
    </div>
  )
}
