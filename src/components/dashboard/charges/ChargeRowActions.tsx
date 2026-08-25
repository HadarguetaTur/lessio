'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, CircleSlash, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RecordPaymentDialog, type RecordPaymentInput } from './RecordPaymentDialog'
import { ResolveChargeDialog } from './ResolveChargeDialog'

interface ChargeRowActionsProps {
  chargeId: string
  remaining: number
  isOwner: boolean
  hasPaymentLink: boolean
  hasInvoice: boolean
  recordPaymentAction: (input: RecordPaymentInput) => Promise<{ error: string | null }>
  waiveAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
  voidAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
}

/**
 * One row, one obvious action.
 *
 * Every open charge used to show three buttons — record payment, waive, void —
 * of which the tutor wants the first roughly always. Waiving and voiding are
 * corrections, so they move behind the overflow menu where corrections live.
 *
 * The dialogs sit outside the menu on purpose: a dialog opened from inside a
 * DropdownMenuItem unmounts with the menu the moment it closes.
 */
export function ChargeRowActions({
  chargeId,
  remaining,
  isOwner,
  hasPaymentLink,
  hasInvoice,
  recordPaymentAction,
  waiveAction,
  voidAction,
}: ChargeRowActionsProps) {
  const t = useTranslations('charges.resolve')
  const tCommon = useTranslations('common')
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <RecordPaymentDialog
        chargeId={chargeId}
        remaining={remaining}
        action={recordPaymentAction}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tCommon('actions.more')}
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setWaiveOpen(true)}>
            <CircleSlash size={13} className="me-2" />
            {t('waive.action')}
          </DropdownMenuItem>
          {isOwner && (
            <DropdownMenuItem onSelect={() => setVoidOpen(true)}>
              <Ban size={13} className="me-2" />
              {t('void.action')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResolveChargeDialog
        chargeId={chargeId}
        mode="waive"
        action={waiveAction}
        hasPaymentLink={hasPaymentLink}
        hasInvoice={hasInvoice}
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
      />
      {isOwner && (
        <ResolveChargeDialog
          chargeId={chargeId}
          mode="void"
          action={voidAction}
          hasPaymentLink={hasPaymentLink}
          hasInvoice={hasInvoice}
          open={voidOpen}
          onOpenChange={setVoidOpen}
        />
      )}
    </div>
  )
}
