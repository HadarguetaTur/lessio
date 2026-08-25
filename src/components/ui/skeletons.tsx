import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Loading placeholder for the list screens (students, charges, debtors,
 * billing, homework).
 *
 * A centred spinner on an empty canvas tells you the app is busy but not what
 * is coming; the page then snaps into a different shape. Holding the real
 * layout — header, filter row, rows — makes the wait feel like the page
 * arriving rather than the app hanging.
 */
export function ListPageSkeleton({
  rows = 6,
  filters = 0,
}: {
  rows?: number
  filters?: number
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader title="" />

      {filters > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {Array.from({ length: filters }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Loading placeholder for the single-column create/edit forms. */
export function FormPageSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="max-w-lg">
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}
