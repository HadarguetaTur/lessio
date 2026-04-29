import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getDashboardConversationSummaries } from '@/lib/portal/messages'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function DashboardMessagesPage() {
  const session = await getSession()
  const summaries = await getDashboardConversationSummaries(session.orgId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="הודעות פורטל"
        subtitle="שיחות עם הורים מפורטל ההורים"
      />

      {summaries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="אין הודעות"
          subtitle="הודעות מהורים דרך פורטל ההורים יופיעו כאן."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תלמיד</TableHead>
                <TableHead>הורה</TableHead>
                <TableHead>הודעה אחרונה</TableHead>
                <TableHead>תאריך</TableHead>
                <TableHead>חדשות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => (
                <TableRow key={s.studentId}>
                  <TableCell>
                    <Link
                      href={`/messages/${s.studentId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.studentName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.parentName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {s.lastMessage.length > 80 ? s.lastMessage.slice(0, 80) + '…' : s.lastMessage}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleDateString('he-IL') : ''}
                  </TableCell>
                  <TableCell>
                    {s.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {s.unreadCount}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
