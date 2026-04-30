'use client'

import { useLocale, useTranslations } from 'next-intl'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { MonthlyRevenueBucket } from '@/lib/reports/revenue'
import { truncateTick } from '@/lib/reports/chartMonthTick'
import { useMatchMedia } from '@/lib/hooks/useMatchMedia'

interface RevenueChartProps {
  buckets: MonthlyRevenueBucket[]
}

function MobileStackedChart({
  buckets,
  intlLoc,
}: {
  buckets: MonthlyRevenueBucket[]
  intlLoc: string
}) {
  const t = useTranslations('reports.revenue')
  const perRow = 40
  const legendBlock = 44
  const verticalPadding = 28
  const chartHeight = Math.max(240, legendBlock + verticalPadding + buckets.length * perRow)

  const formatXTicks = (v: number) =>
    v >= 1000 ? `₪${Math.round(v / 1000)}k` : `₪${v.toLocaleString(intlLoc)}`

  return (
    <div className="max-h-[75vh] min-w-0 w-full overflow-y-auto overscroll-y-contain rounded-md">
      <div className="w-full" style={{ height: chartHeight, minHeight: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={buckets}
            margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis
              type="number"
              tickFormatter={formatXTicks}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="month"
              tickFormatter={truncateTick}
              tick={{ fontSize: 12, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
              width={44}
              interval={0}
            />
            <Tooltip
              formatter={(value, name) => [
                `₪${Number(value ?? 0).toLocaleString(intlLoc)}`,
                String(name),
              ]}
              contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as MonthlyRevenueBucket | undefined
                return row?.label ?? ''
              }}
            />
            <Legend
              verticalAlign="top"
              height={legendBlock}
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              stackId="rev"
              dataKey="revenue"
              name={t('legendPaidRevenue')}
              fill="#3b82f6"
              maxBarSize={32}
            />
            <Bar
              stackId="rev"
              dataKey="billingTotal"
              name={t('legendMonthlyBilling')}
              fill="#8b5cf6"
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function RevenueChart({ buckets }: RevenueChartProps) {
  const intlLoc = toIntlLocale(parseAppLocale(useLocale()))
  const t = useTranslations('reports.revenue')
  const compact = useMatchMedia('(max-width: 639px)')

  if (compact) {
    return <MobileStackedChart buckets={buckets} intlLoc={intlLoc} />
  }

  return (
    <div className="min-w-0 w-full" style={{ height: 232 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => `₪${v.toLocaleString(intlLoc)}`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value, name) => [
              `₪${Number(value ?? 0).toLocaleString(intlLoc)}`,
              String(name),
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend />
          <Bar dataKey="revenue" name={t('legendPaidRevenue')} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="billingTotal" name={t('legendMonthlyBilling')} fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
