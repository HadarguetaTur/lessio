import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getWaConnectionState } from '@/lib/whatsapp/connectionState'
import { WaStatusBadge } from '@/components/dashboard/settings/WaStatusBadge'

/**
 * "מה קורה עם הוואטסאפ שלי?", answered where the work happens.
 *
 * The audit put this question in settings and left the inbox silent about it.
 * But the person reading conversations is exactly the person who needs to know
 * whether her number can send — so the state gets one quiet line at the top of
 * the inbox, with the number itself, and a way through only when there is
 * something to do.
 *
 * Deliberately one line. A banner here would compete with the dashboard banner
 * that already shouts about the three states that stop the business.
 */
export async function InboxStatusStrip({ orgId, canFix }: { orgId: string; canFix: boolean }) {
  const [status, t] = await Promise.all([
    getWaConnectionState(orgId),
    getTranslations('settings.whatsappState'),
  ])

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <WaStatusBadge state={status.state} detail={status.displayPhoneNumber} />

      {status.state !== 'active' && (
        <span className="text-muted-foreground">{t(`${status.state}.description`)}</span>
      )}

      {status.needsAction && canFix && (
        <Link
          href="/settings/whatsapp"
          className="font-medium text-primary underline underline-offset-4"
        >
          {t('fixLink')}
        </Link>
      )}
    </div>
  )
}
