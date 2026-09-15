import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  formatUntil,
  toLockedInfo,
  type WaCapabilities,
  type WaCapability,
  type WaCapabilityReason,
} from '@/lib/whatsapp/capabilities'
import { WaStatusBadge } from '@/components/dashboard/settings/WaStatusBadge'
import { LockedFeatureTrigger } from '@/components/whatsapp/LockedFeature'

/**
 * "מה קורה עם הוואטסאפ שלי?", answered where the work happens.
 *
 * The audit put this question in settings and left the inbox silent about it.
 * But the person reading conversations is exactly the person who needs to know
 * whether her number can send — so the state gets one quiet line at the top of
 * the inbox, with the number itself, and a way through only when there is
 * something to do.
 *
 * "Active with limits" used to be the whole sentence for `limited`, and the
 * owner read it as "locked for a month". So the line now names each limit
 * with its number and its date — "new number: broadcasts up to 50 recipients
 * until 28.09" — and every state short of active gets a "details" that opens
 * the same explanation the locked pages show.
 *
 * Deliberately one line. A banner here would compete with the dashboard banner
 * that already shouts about the three states that stop the business.
 */

/** How many limits the line names before it stops being one line. */
const STRIP_REASON_LIMIT = 3

/** The verdict the "details" dialog leads with: a lock before a limit, sending before reading. */
function leadCapability(byKey: WaCapabilities['byKey']): WaCapability | null {
  const order: Array<keyof WaCapabilities['byKey']> = [
    'conversations',
    'service_updates',
    'promo_broadcasts',
  ]
  return (
    order.map((k) => byKey[k]).find((c) => c.status === 'locked') ??
    order.map((k) => byKey[k]).find((c) => c.status === 'limited') ??
    null
  )
}

/** Each limit once, with the cap and date of the capability that carries it. */
function stripReasons(
  byKey: WaCapabilities['byKey']
): Array<{ reason: WaCapabilityReason; cap: number | null; until: string | null }> {
  const seen = new Set<WaCapabilityReason>()
  const out: Array<{ reason: WaCapabilityReason; cap: number | null; until: string | null }> = []
  for (const cap of [byKey.service_updates, byKey.promo_broadcasts]) {
    for (const reason of cap.reasons) {
      if (seen.has(reason)) continue
      seen.add(reason)
      out.push({ reason, cap: cap.cap, until: cap.until })
    }
  }
  return out.slice(0, STRIP_REASON_LIMIT)
}

export async function InboxStatusStrip({
  capabilities,
  locale,
  canFix,
}: {
  capabilities: WaCapabilities
  locale: string
  canFix: boolean
}) {
  const { connection, byKey, timezone } = capabilities
  const [t, tc] = await Promise.all([
    getTranslations('settings.whatsappState'),
    getTranslations('whatsappCapability'),
  ])

  const state = connection.state
  const lead = leadCapability(byKey)
  const details = lead ? toLockedInfo(lead, timezone, locale) : null

  const fixHref =
    state === 'plan_locked' ? '/account/billing?upgrade=whatsapp_automation' : '/settings/whatsapp'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <WaStatusBadge state={state} detail={connection.displayPhoneNumber} />

      {state === 'limited' ? (
        <span className="text-muted-foreground">
          {stripReasons(byKey)
            .map(({ reason, cap, until }) =>
              tc(`${reason}.strip`, {
                cap: cap ?? 0,
                until: formatUntil(until, timezone, locale) ?? '',
              })
            )
            .join(' · ')}
        </span>
      ) : (
        state !== 'active' && (
          <span className="text-muted-foreground">{t(`${state}.description`)}</span>
        )
      )}

      {details && state !== 'active' && (
        <LockedFeatureTrigger
          info={details}
          canFix={canFix}
          showIcon={false}
          className="font-medium text-primary underline underline-offset-4"
        >
          {tc('details')}
        </LockedFeatureTrigger>
      )}

      {connection.needsAction && canFix && (
        <Link href={fixHref} className="font-medium text-primary underline underline-offset-4">
          {t('fixLink')}
        </Link>
      )}
    </div>
  )
}
