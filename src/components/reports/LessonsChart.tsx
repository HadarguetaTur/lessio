'use client'

import { useTranslations } from 'next-intl'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyLessonBucket } from '@/lib/reports/lessons'
import { truncateTick } from '@/lib/reports/chartMonthTick'
import { useMatchMedia } from '@/lib/hooks/useMatchMedia'

interface LessonsChartProps {
  buckets: MonthlyLessonBucket[]
}

function MobileStackedChart({ buckets }: { buckets: MonthlyLessonBucket[] }) {
  const t = useTranslations('reports.lessons')
  const perRow = 40
  const legendBlock = 44
  const verticalPadding = 28
  const chartHeight = Math.max(220, legendBlock + verticalPadding + buckets.length * perRow)

  return (
    <div className="max-h-[75vh] min-w-0 w-full overflow-y-auto overscroll-y-contain rounded-md">
      <div className="w-full" style={{ height: chartHeight, minHeight: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={buckets}
            margin={{ top: 4, right: 10, left: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
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
              contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as MonthlyLessonBucket | undefined
                return row?.label ?? ''
              }}
            />
            <Legend
              verticalAlign="top"
              height={legendBlock}
              iconType="circle"
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              stackId="a"
              dataKey="count"
              name={t('chartSeriesTaught')}
              fill="#3b82f6"
              maxBarSize={32}
            />
            <Bar
              stackId="a"
              dataKey="cancelled"
              name={t('chartSeriesCancelled')}
              fill="#fca5a5"
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function LessonsChart({ buckets }: LessonsChartProps) {
  const t = useTranslations('reports.lessons')
  const compact = useMatchMedia('(max-width: 639px)')

  if (compact) {
    return <MobileStackedChart buckets={buckets} />
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
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" name={t('chartSeriesTaught')} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="cancelled" name={t('chartSeriesCancelled')} fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
