'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, CheckCheck, Loader2, Send, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { LeadActionState } from '@/app/(admin)/admin/leads/actions'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'
import type { DemoState } from '@/lib/outbound/leadInbox'

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>
type OutboundAction = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

/**
 * What the founder can do to the prospect side of the card: promote to a
 * lead before any reply, silence the address for good, clear the "needs a
 * look" flag on replies the classifier could not place, or send the demo
 * email (again) by hand.
 */
export function ProspectActions({
  prospectId,
  hasLead,
  unreviewedReplies,
  suppressed,
  demo,
  createLead,
  suppress,
  markReviewed,
  resendDemo,
}: {
  prospectId: string
  hasLead: boolean
  unreviewedReplies: number
  suppressed: boolean
  demo: DemoState
  createLead: LeadAction
  suppress: OutboundAction
  markReviewed: OutboundAction
  resendDemo: LeadAction
}) {
  const t = useTranslations('admin.leads.card')
  const tDemo = useTranslations('admin.leads.demo')
  const [, runCreate, creating] = useActionState(createLead, null)
  const [, runSuppress, suppressing] = useActionState(suppress, null)
  const [, runReview, reviewing] = useActionState(markReviewed, null)
  const [demoResult, runResend, resending] = useActionState(resendDemo, null)

  const submit = (run: (fd: FormData) => void) => {
    const fd = new FormData()
    fd.set('prospectId', prospectId)
    run(fd)
  }

  const demoLabel = demo.state === 'sent' ? tDemo('resend') : tDemo('send')
  const demoIcon = resending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {!hasLead && (
          <Button type="button" size="sm" disabled={creating} onClick={() => submit(runCreate)}>
            {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {t('createLead')}
          </Button>
        )}

        {unreviewedReplies > 0 && (
          <Button type="button" size="sm" variant="outline" disabled={reviewing} onClick={() => submit(runReview)}>
            {reviewing ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            {t('markReviewed', { count: unreviewedReplies })}
          </Button>
        )}

        {/* A second demo is a real email to a real person, so it asks first; the first one does not. */}
        {!suppressed && demo.state === 'sent' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={resending}>
                {demoIcon}
                {demoLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tDemo('resendConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{tDemo('resendConfirmBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => submit(runResend)}>{tDemo('resend')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!suppressed && demo.state !== 'sent' && (
          <Button
            type="button"
            size="sm"
            variant={demo.state === 'none' ? 'outline' : 'default'}
            disabled={resending}
            onClick={() => submit(runResend)}
          >
            {demoIcon}
            {demoLabel}
          </Button>
        )}

        {!suppressed && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={suppressing}>
                <Ban size={14} />
                {t('suppress')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('suppressConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('suppressConfirmBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => submit(runSuppress)}>{t('suppress')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {demoResult?.ok && (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          {tDemo('resent')}
        </p>
      )}
      {demoResult?.error && (
        <p role="alert" className="text-xs text-destructive">
          {tDemo(demoResult.error === 'DEMO_SEND_FAILED' ? 'resendFailed' : 'resendRefused')}
        </p>
      )}
    </div>
  )
}
