import { ListPageSkeleton } from '@/components/ui/skeletons'

export default function StudentsLoading() {
  return <ListPageSkeleton rows={8} filters={2} />
}
