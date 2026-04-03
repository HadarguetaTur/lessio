'use client'

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

interface LessonsChartProps {
  buckets: MonthlyLessonBucket[]
}

export function LessonsChart({ buckets }: LessonsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
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
        <Legend
          formatter={v => (v === 'count' ? 'שיעורים שנלמדו' : 'ביטולים')}
          iconType="circle"
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="count" name="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="cancelled" name="cancelled" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}
