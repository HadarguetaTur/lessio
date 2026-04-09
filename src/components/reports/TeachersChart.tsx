'use client'

import { useTranslations } from 'next-intl'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TeacherRow } from '@/lib/reports/teachers'

interface TeachersChartProps {
  rows: TeacherRow[]
}

export function TeachersChart({ rows }: TeachersChartProps) {
  const t = useTranslations('reports.teachers')
  const data = rows.map(r => ({
    name: r.teacherName,
    lessons: r.lessonsCount,
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 64 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value) => [Number(value ?? 0), t('lessons')]}
        />
        <Bar dataKey="lessons" name={t('lessons')} fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
