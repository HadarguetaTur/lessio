'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, CheckCheck, Loader2, UserPlus } from 'lucide-react'

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

type LeadAction = (prev: LeadActionState | null, formData: FormData) => Promise<LeadActionState>
type OutboundAction = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

/**
 * What the founder can do to the prospect side of the card: promote to a
 * lead before any reply, silence the address for good, or clear the
 * "needs a look" flag on replies the classifier could not place.
 */
export function ProspectActions({
  prospectId,
  hasLead,
  unreviewedReplies,
  suppressed,
  createLead,
  suppress,
  markReviewed,
}: {
  prospectId: string
  hasLead: boolean
  unreviewedReplies: number
  suppressed: boolean
  createLead: LeadAction
  suppress: OutboundAction
  markReviewed: OutboundAction
}) {
  const t = useTranslations('admin.leads.card')
  const [, runCreate, creating] = useActionState(createLead, null)
  const [, runSuppress, suppressing] = useActionState(suppress, null)
  const [, runReview, reviewing] = useActionState(markReviewed, null)

  const submit = (run: (fd: FormData) => void) => {
    const fd = new FormData()
    fd.set('prospectId', prospectId)
    run(fd)
  }

  return (
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
  )
}
