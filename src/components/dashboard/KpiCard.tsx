import Link from 'next/link'
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type KpiVariant = 'default' | 'revenue' | 'debt' | 'students' | 'lessons' | 'warning'

const VARIANT_STYLES: Record<KpiVariant, { icon: string; card: string }> = {
  default:  { icon: 'bg-muted text-muted-foreground', card: '' },
  revenue:  { icon: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400', card: '' },
  debt:     { icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',         card: 'border-amber-200 dark:border-amber-900' },
  students: { icon: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',             card: '' },
  lessons:  { icon: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',     card: '' },
  warning:  { icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',         card: 'border-amber-200 dark:border-amber-900' },
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
  trend?: Trend
  subLabel?: string
  /** Turns the whole card into a link to the screen behind the number. */
  href?: string
  /** `lg` is for the dashboard's two primary money cards. */
  size?: 'default' | 'lg'
  className?: string
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  variant = 'default',
  trend,
  subLabel,
  href,
  size = 'default',
  className,
}: KpiCardProps) {
  const styles = VARIANT_STYLES[variant]

  const Wrapper = href ? Link : 'div'
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...(wrapperProps as { href: string })}
      className={cn(
        'bg-card rounded-xl border border-border shadow-sm px-5 py-4 flex flex-col gap-3 transition-shadow duration-200 hover:shadow-md',
        size === 'lg' && 'h-full px-5 py-5 sm:px-6',
        href && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        styles.card,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'text-xs font-medium text-muted-foreground leading-tight',
            size === 'lg' && 'text-sm'
          )}
        >
          {label}
        </p>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-150 hover:scale-110', size === 'lg' && 'w-9 h-9', styles.icon)}>
            <Icon size={size === 'lg' ? 18 : 16} />
          </div>
        )}
      </div>

      <div className={cn(size === 'lg' && 'mt-auto')}>
        <p
          className={cn(
            'text-2xl font-bold leading-none text-foreground',
            size === 'lg' && 'text-3xl tracking-tight'
          )}
        >
          {value}
        </p>
        {subLabel && (
          <p className="text-xs text-muted-foreground mt-1">{subLabel}</p>
        )}
      </div>

      {trend && (
        <div className="flex items-center gap-1">
          {trend.direction === 'up' && <TrendingUp size={12} className="text-emerald-500" />}
          {trend.direction === 'down' && <TrendingDown size={12} className="text-red-600" />}
          {trend.direction === 'neutral' && <Minus size={12} className="text-muted-foreground" />}
          <span
            className={cn(
              'text-xs',
              trend.direction === 'up' && 'text-emerald-700 dark:text-emerald-400',
              trend.direction === 'down' && 'text-red-600',
              trend.direction === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trend.label}
          </span>
        </div>
      )}
    </Wrapper>
  )
}
