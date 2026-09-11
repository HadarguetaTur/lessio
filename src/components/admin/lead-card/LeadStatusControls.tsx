'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LOST_REASONS, PLATFORM_LEAD_STATUSES, type PlatformLeadStatus } from '@/lib/outbound/types'
import type { LeadActionState } from '@/app/(admin)/admin/leads/actions'

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>

/**
 * One button per status, current one disabled — the TicketStatusControls
 * pattern, because one click to any state beats two. "Lost" is the exception:
 * it needs a reason, so that button opens a reason row instead of submitting.
 */
export function LeadStatusControls({
  leadId,
  current,
  lostReason,
  setStatus,
}: {
  leadId: string
  current: PlatformLeadStatus
  lostReason: string | null
  setStatus: LeadAction
}) {
  const t = useTranslations('admin.leads')
  const [state, formAction, pending] = useActionState(setStatus, null)
  const [askingLost, setAskingLost] = useState(false)
  const [reason, setReason] = useState<string>('no_response')

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <span className="text-xs font-medium text-muted-foreground">{t('statusActions.changeStatus')}</span>
      <div className="flex flex-wrap gap-2">
        {PLATFORM_LEAD_STATUSES.map((status) =>
          status === 'lost' ? (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={status === current ? 'default' : 'outline'}
              disabled={pending || status === current}
              onClick={() => setAskingLost((v) => !v)}
            >
              {t(`status.${status}`)}
            </Button>
          ) : (
            <Button
              key={status}
              type="submit"
              name="status"
              value={status}
              size="sm"
              variant={status === current ? 'default' : 'outline'}
              disabled={pending || status === current}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {t(`status.${status}`)}
            </Button>
          )
        )}
      </div>

      {current === 'lost' && lostReason && !askingLost && (
        <p className="text-xs text-muted-foreground">
          {t('statusActions.lostReason')}: {t.has(`lostReasons.${lostReason}`) ? t(`lostReasons.${lostReason}`) : lostReason}
        </p>
      )}

      {askingLost && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <label className="text-xs font-medium" htmlFor={`lost-${leadId}`}>
            {t('statusActions.lostReason')}
          </label>
          <select
            id={`lost-${leadId}`}
            name="lostReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`lostReasons.${r}`)}
              </option>
            ))}
          </select>
          {reason === 'other' && (
            <Input name="lostReasonText" placeholder={t('statusActions.lostReasonText')} maxLength={200} required />
          )}
          <div className="flex gap-2">
            <Button type="submit" name="status" value="lost" size="sm" variant="destructive" disabled={pending}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('statusActions.confirmLost')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAskingLost(false)}>
              {t('card.cancel')}
            </Button>
          </div>
        </div>
      )}

      {state?.error && <p className="text-xs text-destructive">{t(`errors.${state.error}`)}</p>}
    </form>
  )
}
