import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'

/** Mirrors the calendar: view toggle, week nav, then the day columns. */
export default function LessonsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader title="" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-9 w-52 rounded-md" />
      </div>

      <div className="flex flex-col gap-3 md:grid md:grid-cols-7 md:gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
