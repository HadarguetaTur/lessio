'use client'

/**
 * Lazy entry point for the dashboard's revenue sparkline — see
 * src/components/reports/lazyCharts.tsx for why recharts is never imported
 * directly from a server component.
 */

import dynamic from 'next/dynamic'

import { Skeleton } from '@/components/ui/skeleton'

export const MiniRevenueChart = dynamic(
  () => import('./MiniRevenueChart').then((m) => m.MiniRevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-[180px] w-full rounded-md" /> },
)
