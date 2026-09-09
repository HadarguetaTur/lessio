'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Ban, Loader2, Pause, Play } from 'lucide-react'
import type { BroadcastActionResult } from '@/app/(dashboard)/messages/broadcasts/actions'

/**
 * Pause, resume and cancel for a campaign in flight.
 *
 * Pausing matters more than it looks: an owner who spots a typo in an
 * announcement going to two hundred parents has seconds, not minutes, and the
 * drain claims a new batch every couple of minutes.
 */
export function BroadcastControls({
  campaignId,
  status,
  action,
}: {
  campaignId: string
  status: string
  action: (id: string, action: 'pause' | 'resume' | 'cancel') => Promise<BroadcastActionResult>
}) {
  const t = useTranslations('broadcasts')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const run = (kind: 'pause' | 'resume' | 'cancel') => {
    if (kind === 'cancel' && !confirm(t('controls.confirmCancel'))) return
    startTransition(async () => {
      await action(campaignId, kind)
      router.refresh()
    })
  }

  const inFlight = status === 'sending' || status === 'scheduled'
  if (!inFlight && status !== 'paused') return null

  return (
    <div className="flex items-center gap-2">
      {isPending && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      {inFlight && (
        <button
          type="button"
          onClick={() => run('pause')}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Pause size={14} />
          {t('controls.pause')}
        </button>
      )}
      {status === 'paused' && (
        <button
          type="button"
          onClick={() => run('resume')}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Play size={14} />
          {t('controls.resume')}
        </button>
      )}
      <button
        type="button"
        onClick={() => run('cancel')}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
      >
        <Ban size={14} />
        {t('controls.cancel')}
      </button>
    </div>
  )
}
