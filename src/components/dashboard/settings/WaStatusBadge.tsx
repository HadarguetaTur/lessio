import { CheckCircle, AlertTriangle, AlertCircle, Clock, Circle, Lock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import type { WaConnectionState, WaState } from '@/lib/whatsapp/connectionState'

/**
 * The one WhatsApp status badge. Connections hub, settings page and the
 * dashboard banner all render this, so they cannot disagree about what the
 * customer's number is doing (UX audit F1/F21).
 *
 * Each state carries an icon AND a word — the audit's rule that status may
 * never be conveyed by colour alone. Green appears for exactly one state.
 */

const PRESENTATION: Record<
  WaState,
  { icon: typeof CheckCircle; className: string }
> = {
  active: {
    icon: CheckCircle,
    className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300',
  },
  limited: {
    icon: Clock,
    className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  },
  at_risk: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  },
  blocked_by_meta: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  },
  reconnect_required: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
  },
  not_connected: { icon: Circle, className: 'border-border text-muted-foreground' },
  plan_locked: { icon: Lock, className: 'border-border text-muted-foreground' },
}

export async function WaStatusBadge({
  state,
  detail,
  className,
}: {
  state: WaState
  /** Extra text after a middot — the phone number on the connections hub. */
  detail?: string | null
  className?: string
}) {
  const t = await getTranslations('settings.whatsappState')
  const { icon: Icon, className: tone } = PRESENTATION[state]

  return (
    <Badge variant="outline" className={`${tone} ${className ?? ''}`}>
      <Icon aria-hidden />
      <span className="truncate">
        {t(`${state}.label`)}
        {detail ? ` · ${detail}` : ''}
      </span>
    </Badge>
  )
}

/**
 * The badge plus the sentence that explains it, and — for anything that is not
 * simply working — either the action or an explicit "nothing for you to do".
 * That last line is the audit's central ask: a customer must never have to
 * guess whether Lessio is waiting or they are.
 */
export async function WaStatusSummary({
  status,
  className,
}: {
  status: WaConnectionState
  className?: string
}) {
  const t = await getTranslations('settings.whatsappState')

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <WaStatusBadge state={status.state} />
      <p className="text-sm text-muted-foreground">{t(`${status.state}.description`)}</p>

      {status.reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {status.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{t(`reasons.${reason}`)}</span>
            </li>
          ))}
        </ul>
      )}

      {!status.needsAction && status.state !== 'active' && (
        <p className="text-sm font-medium text-muted-foreground">{t('noActionNeeded')}</p>
      )}
    </div>
  )
}
