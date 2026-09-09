'use client'

/**
 * Disconnecting is the most destructive thing on this page and used to be its
 * least guarded: a single click unsubscribed the WABA from Lessio's app,
 * cleared the credentials and stopped every automation in the org, with no
 * confirmation and no statement of what would stop (UX audit F2).
 *
 * The confirmation string had in fact been written and translated at some
 * point, and was referenced by nothing. It is wired here.
 *
 * The dialog names the automations by the same labels the toggles below use, so
 * the list reads as "these things you switched on will stop" rather than as an
 * abstract warning — and it says plainly that coming back means redoing Meta's
 * flow, which is the part an owner cannot guess.
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { disconnectWhatsApp, type WhatsAppActionResult } from './actions'

const initialState: WhatsAppActionResult = { error: null }

/** The flows that stop the moment the number is gone, in the order they matter. */
const STOPPED_FLOWS = [
  'automation_lesson_reminder_enabled',
  'automation_payment_request_enabled',
  'automation_cancellation_enabled',
  'ai_assistant_enabled',
] as const

export function DisconnectButton({ disabled, disabledReason }: {
  disabled?: boolean
  disabledReason?: string
} = {}) {
  const t = useTranslations('settings.whatsapp')
  const tp = useTranslations('settings')
  const tFlows = useTranslations('settings.automations.flows')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(disconnectWhatsApp, initialState)

  return (
    <>
      {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-describedby={disabled && disabledReason ? 'disconnect-blocked' : undefined}
        onClick={() => setOpen(true)}
        className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
      >
        {t('disconnect')}
      </Button>

      {disabled && disabledReason && (
        <p id="disconnect-blocked" className="mt-2 text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}

      <AlertDialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <AlertDialogContent>
          <form action={formAction}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('disconnectConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>
                {tp('whatsappPage.disconnectImpact')}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <ul className="my-4 space-y-1.5 text-sm text-muted-foreground">
              {STOPPED_FLOWS.map((flow) => (
                <li key={flow} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{tFlows(`${flow}.label`)}</span>
                </li>
              ))}
            </ul>

            <p className="text-sm text-muted-foreground">
              {tp('whatsappPage.disconnectKeeps')}
            </p>
            <p className="mt-2 text-sm font-medium">{tp('whatsappPage.disconnectReturn')}</p>

            {state.error && <p className="pt-2 text-sm text-destructive">{state.error}</p>}

            <AlertDialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon('actions.cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? `${tCommon('actions.disconnect')}…` : t('disconnect')}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
