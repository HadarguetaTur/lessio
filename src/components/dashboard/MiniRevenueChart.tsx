'use client'

import { useId } from 'react'
import { AreaChart, Area, Tooltip, XAxis } from 'recharts'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { useMeasuredWidth } from '@/lib/hooks/useMeasuredWidth'

const CHART_HEIGHT = 180

interface MiniRevenueChartProps {
  data: { month: string; amount: number }[]
  locale?: string
}

function CustomTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean
  payload?: { payload: { month: string; amount: number } }[]
  locale: string
}) {
  if (!active || !payload?.length) return null
  const { month, amount } = payload[0].payload
  return (
    <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-sm text-xs">
      <p className="font-medium">{month}</p>
      <p className="text-emerald-700 dark:text-emerald-400">{formatCurrency(amount, locale)}</p>
    </div>
  )
}

export function MiniRevenueChart({ data, locale = 'he' }: MiniRevenueChartProps) {
  // useId output contains characters that are invalid inside url(#…) refs.
  const gradientId = `revenue-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>()

  return (
    <div ref={wrapRef} className="min-w-0 w-full" style={{ height: CHART_HEIGHT }}>
      {width > 0 && (
        <AreaChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickMargin={6}
            interval="preserveStartEnd"
          />
          <Tooltip content={<CustomTooltip locale={locale} />} />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#10b981"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      )}
    </div>
  )
}
