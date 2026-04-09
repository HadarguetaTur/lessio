import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type KpiVariant = 'default' | 'revenue' | 'debt' | 'students' | 'lessons' | 'warning'

const VARIANT_STYLES: Record<KpiVariant, { icon: string; card: string }> = {
  default:  { icon: 'bg-muted text-muted-foreground',       card: '' },
  revenue:  { icon: 'bg-emerald-50 text-emerald-600',       card: '' },
  debt:     { icon: 'bg-amber-50 text-amber-500',           card: 'border-amber-200' },
  students: { icon: 'bg-blue-50 text-blue-600',             card: '' },
  lessons:  { icon: 'bg-purple-50 text-purple-600',         card: '' },
  warning:  { icon: 'bg-amber-50 text-amber-500',           card: 'border-amber-200' },
}

interface Trend {
  direction: 'up' | 'down' | 'neutral'
  label: string
}

interface KpiCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  variant?: KpiVariant
  highlight?: boolean
  trend?: Trend
  subLabel?: string
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  highlight,
  trend,
  subLabel,
}: KpiCardProps) {
  const effectiveVariant: KpiVariant = highlight ? 'warning' : variant
  const styles = VARIANT_STYLES[effectiveVariant]

  const valueClass = highlight ? 'text-amber-500' : 'text-foreground'

  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border shadow-sm px-5 py-4 flex flex-col gap-3 transition-shadow duration-200 hover:shadow-md',
        styles.card
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 hover:scale-110', styles.icon)}>
            <Icon size={16} />
          </div>
        )}
      </div>

      <div>
        <p className={cn('text-2xl font-bold leading-none', valueClass)}>{value}</p>
        {subLabel && (
          <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>
        )}
      </div>

      {trend && (
        <div className="flex items-center gap-1">
          {trend.direction === 'up' && <TrendingUp size={12} className="text-emerald-500" />}
          {trend.direction === 'down' && <TrendingDown size={12} className="text-red-500" />}
          {trend.direction === 'neutral' && <Minus size={12} className="text-muted-foreground" />}
          <span
            className={cn(
              'text-xs',
              trend.direction === 'up' && 'text-emerald-600',
              trend.direction === 'down' && 'text-red-500',
              trend.direction === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trend.label}
          </span>
        </div>
      )}
    </div>
  )
}
