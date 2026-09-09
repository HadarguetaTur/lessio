import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getWaConnectionState } from '@/lib/whatsapp/connectionState'

/**
 * The only WhatsApp state that leaves the settings page.
 *
 * WhatsApp carries the reminders, payment requests, cancellations and the
 * parent-facing bot — so when it stops, the studio stops, and until now the
 * only signal was an in-app notification that could be dismissed or missed.
 * The dashboard said nothing, and the setup checklist had already ticked
 * WhatsApp off and removed itself (UX audit F6).
 *
 * Deliberately narrow. Three states appear here and nothing else: the two in
 * which no message can leave, and the one where the number is actively being
 * damaged. `limited`, warm-up and a pending verification stay in settings —
 * they are not emergencies, and a banner for them would train the owner to
 * ignore this strip, which is exactly what would make it useless on the day it
 * matters.
 */

const BANNERED = ['reconnect_required', 'blocked_by_meta', 'at_risk'] as const
type BanneredState = (typeof BANNERED)[number]

const TONE: Record<BanneredState, { className: string; role: 'alert' | 'status' }> = {
  reconnect_required: {
    className:
      'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
    role: 'alert',
  },
  blocked_by_meta: {
    className:
      'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
    role: 'alert',
  },
  at_risk: {
    className:
      'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
    role: 'status',
  },
}

function isBannered(state: string): state is BanneredState {
  return (BANNERED as readonly string[]).includes(state)
}

export async function WhatsAppHealthBanner({ orgId }: { orgId: string }) {
  // No template check: this renders on every dashboard page, and the only state
  // that check can produce is `limited`, which never reaches the banner.
  const status = await getWaConnectionState(orgId)
  if (!isBannered(status.state)) return null

  const t = await getTranslations('dashboard.whatsappBanner')
  const { className, role } = TONE[status.state]

  return (
    <div role={role} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${className}`}>
      {t(status.state)}
      <Link
        href="/settings/whatsapp"
        className="ms-2 font-medium underline underline-offset-4"
      >
        {t('action')}
      </Link>
    </div>
  )
}
