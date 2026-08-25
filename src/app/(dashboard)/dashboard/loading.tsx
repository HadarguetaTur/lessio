import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Mirrors the dashboard's own layout — today full width, the needs-attention
 * card row, the two money cards, the charts — so the page fills in rather than
 * jumping from a spinner into a completely different shape.
 */
export default function DashboardLoading() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader className="mb-0 gap-3 sm:mb-0" title="" />

      {/* Today, full width */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="space-y-2 px-2 pb-3 sm:px-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Needs attention — three cards in a row */}
      <div>
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Money */}
      <div>
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Forecast + trend */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
