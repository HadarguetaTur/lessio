'use client'

/**
 * Lazy entry points for the recharts-based report charts.
 *
 * recharts is ~320 KB of JavaScript. Importing a chart directly from a server
 * page puts that in the route's first-load bundle; going through these
 * wrappers ships it in its own chunk, fetched only once the page has painted.
 * `ssr: false` is deliberate: the charts size themselves from the container
 * and have nothing useful to say in HTML.
 */

import dynamic from 'next/dynamic'

import { Skeleton } from '@/components/ui/skeleton'

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full rounded-md" />
}

export const LessonsChart = dynamic(
  () => import('./LessonsChart').then((m) => m.LessonsChart),
  { ssr: false, loading: ChartSkeleton },
)

export const RevenueChart = dynamic(
  () => import('./RevenueChart').then((m) => m.RevenueChart),
  { ssr: false, loading: ChartSkeleton },
)

export const TeachersChart = dynamic(
  () => import('./TeachersChart').then((m) => m.TeachersChart),
  { ssr: false, loading: ChartSkeleton },
)

export const TeacherLessonsChart = dynamic(
  () => import('./TeacherLessonsChart').then((m) => m.TeacherLessonsChart),
  { ssr: false, loading: ChartSkeleton },
)
