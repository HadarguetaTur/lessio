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
import type { TeacherMonthlyLessonBucket } from '@/lib/reports/teacherReports'
import { truncateTick } from '@/lib/reports/chartMonthTick'
import { useMatchMedia } from '@/lib/hooks/useMatchMedia'

interface TeacherLessonsChartProps {
  buckets: TeacherMonthlyLessonBucket[]
}

/** Stacked horizontal bars: one row per month — readable on narrow screens. */
function MobileStackedChart({ buckets }: { buckets: TeacherMonthlyLessonBucket[] }) {
  const t = useTranslations('teacherSelf.reports.lessonsChart')
  const perRow = 40
  const legendBlock = 44
  const verticalPadding = 28
  const chartHeight = Math.max(240, legendBlock + verticalPadding + buckets.length * perRow)

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
              formatter={(value, name) => [value, name]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as TeacherMonthlyLessonBucket | undefined
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
              stackId="lessons"
              dataKey="completed"
              name={t('completed')}
              fill="#34d399"
              maxBarSize={32}
            />
            <Bar stackId="lessons" dataKey="cancelled" name={t('cancelled')} fill="#fca5a5" maxBarSize={32} />
            <Bar stackId="lessons" dataKey="noShow" name={t('noShow')} fill="#fbbf24" maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TeacherLessonsChart({ buckets }: TeacherLessonsChartProps) {
  const t = useTranslations('teacherSelf.reports.lessonsChart')
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
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="completed" name={t('completed')} fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="cancelled" name={t('cancelled')} fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="noShow" name={t('noShow')} fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
