'use client'

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/i18n/formatCurrency'

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
      <p className="text-emerald-600">{formatCurrency(amount, locale)}</p>
    </div>
  )
}

export function MiniRevenueChart({ data, locale = 'he' }: MiniRevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<CustomTooltip locale={locale} />} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#revenueGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
