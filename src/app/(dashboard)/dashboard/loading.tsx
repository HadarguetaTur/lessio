import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Mirrors the dashboard's own layout — today band, needs-attention, the two
 * money cards, the charts — so the page fills in rather than jumping from a
 * spinner into a completely different shape.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col">
      <PageHeader title="" />

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
        <div>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Skeleton className="mb-3 h-4 w-40" />
      <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </section>
    </div>
  )
}
