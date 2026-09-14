import { InboxRail } from '@/components/inbox/InboxRail'
import { InboxPanes } from '@/components/inbox/InboxPanes'

/** Conversations: the rail on the left, whichever thread is open on the right. */
export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <InboxPanes rail={<InboxRail />} thread={children} />
}
