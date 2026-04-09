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

interface RevenueChartProps {
  buckets: MonthlyRevenueBucket[]
}

export function RevenueChart({ buckets }: RevenueChartProps) {
  const intlLoc = toIntlLocale(parseAppLocale(useLocale()))
  const t = useTranslations('reports.revenue')

  return (
    <ResponsiveContainer width="100%" height={220}>
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
  )
}
