import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getDashboardConversationSummaries } from '@/lib/portal/messages'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getTranslations } from 'next-intl/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function DashboardMessagesPage() {
  const t = await getTranslations()
  const session = await getSession()
  const summaries = await getDashboardConversationSummaries(session.orgId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('lessons.messagesPage.title')}
        subtitle={t('lessons.messagesPage.subtitle')}
      />

      {summaries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t('lessons.messagesPage.emptyTitle')}
          subtitle={t('lessons.messagesPage.emptySubtitle')}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('lessons.messagesPage.colStudent')}</TableHead>
                <TableHead>{t('lessons.messagesPage.colParent')}</TableHead>
                <TableHead>{t('lessons.messagesPage.colLastMessage')}</TableHead>
                <TableHead>{t('lessons.messagesPage.colDate')}</TableHead>
                <TableHead>{t('lessons.messagesPage.colUnread')}</TableHead>
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
