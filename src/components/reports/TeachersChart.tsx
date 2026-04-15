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
import { useMatchMedia } from '@/lib/hooks/useMatchMedia'

interface TeachersChartProps {
  rows: TeacherRow[]
}

function truncateLabel(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  return `${name.slice(0, Math.max(0, maxLen - 1))}…`
}

export function TeachersChart({ rows }: TeachersChartProps) {
  const t = useTranslations('reports.teachers')
  const compact = useMatchMedia('(max-width: 639px)')
  const maxLen = compact ? 22 : 32
  const rowH = compact ? 48 : 40
  const chartHeight = Math.max(200, rows.length * rowH + 56)

  const data = rows.map(r => ({
    name: r.teacherName,
    lessons: r.lessonsCount,
  }))

  const leftMargin = compact ? 10 : 12
  const yAxisWidth = compact ? 100 : 80

  const chartInner = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{
          top: 8,
          right: compact ? 12 : 24,
          bottom: 8,
          left: leftMargin,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis
          type="number"
          tick={{ fontSize: compact ? 12 : 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickFormatter={(v) => truncateLabel(String(v), maxLen)}
          tick={{ fontSize: compact ? 11 : 12, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
        />
        <Tooltip
          contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value) => [Number(value ?? 0), t('lessons')]}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as { name?: string } | undefined
            return row?.name ?? ''
          }}
        />
        <Bar
          dataKey="lessons"
          name={t('lessons')}
          fill="#3b82f6"
          radius={[0, 4, 4, 0]}
          maxBarSize={compact ? 36 : 28}
        />
      </BarChart>
    </ResponsiveContainer>
  )

  if (compact) {
    return (
      <div className="max-h-[75vh] min-w-0 w-full overflow-y-auto overscroll-y-contain rounded-md">
        <div className="w-full" style={{ height: chartHeight, minHeight: chartHeight }}>
          {chartInner}
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 w-full" style={{ height: Math.min(chartHeight, 400) }}>
      {chartInner}
    </div>
  )
}
