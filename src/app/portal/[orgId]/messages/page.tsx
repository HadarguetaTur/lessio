import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { getPortalSession } from '@/lib/portal/session'
import { requirePortalFeature } from '@/lib/portal/features'
import { getParentConversationSummaries } from '@/lib/portal/messages'
import { PortalTabBar } from '@/components/portal/PortalTabBar'
import { PollingRefresh } from '@/lib/realtime/PollingRefresh'

export default async function PortalMessagesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }
  await requirePortalFeature(orgId, 'messages')

  const [summaries, t, locale] = await Promise.all([
    getParentConversationSummaries(orgId, session.parentId),
    getTranslations('portal.messages'),
    getLocale(),
  ])
  const intlLocale = toIntlLocale(parseAppLocale(locale))

  return (
    <div className="flex flex-col flex-1 pb-20">
      <PollingRefresh intervalMs={30_000} />
      <header className="px-4 py-3.5 border-b border-border bg-card flex items-center gap-2">
        <MessageCircle size={16} className="text-muted-foreground" />
        <h1 className="font-semibold text-foreground text-sm">{t('title')}</h1>
      </header>

      <main className="flex-1 p-4 space-y-2">
        {summaries.length === 0 ? (
          <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
            <MessageCircle size={24} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('emptyTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('emptyBody')}</p>
          </div>
        ) : (
          summaries.map((summary) => (
            <Link
              key={summary.studentId}
              href={`/portal/${orgId}/messages/${summary.studentId}`}
              className="block bg-card border border-border rounded-xl p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{summary.studentName}</p>
                  {/* A row that is only a name says nothing about whether there
                      is anything behind it. */}
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {summary.lastMessage
                      ? summary.lastMessage.length > 60
                        ? summary.lastMessage.slice(0, 60) + '…'
                        : summary.lastMessage
                      : t('noMessagesYet')}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {summary.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {summary.unreadCount}
                    </span>
                  )}
                  {summary.lastMessageAt && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(summary.lastMessageAt).toLocaleDateString(intlLocale)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </main>

      <PortalTabBar orgId={orgId} active="messages" />
    </div>
  )
}
