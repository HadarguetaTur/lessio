'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, CheckCheck, CircleSlash, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  RecordPaymentDialog,
  type ManualPaymentResult,
  type RecordPaymentInput,
} from './RecordPaymentDialog'
import { ResolveChargeDialog } from './ResolveChargeDialog'
import {
  SettleBalanceDialog,
  type SettleBalanceInput,
  type SettleBalanceResult,
} from './SettleBalanceDialog'

interface ChargeRowActionsProps {
  chargeId: string
  remaining: number
  isOwner: boolean
  hasPaymentLink: boolean  parent: { id: string; name: string; hasPhone: boolean }
  /**
   * The parent's whole open balance. The settle item shows only when it spans
   * more than this one charge — otherwise "record payment" already does it.
   */
  parentBalance?: { total: number; count: number }
  /** Org default for the confirmation checkbox, set at /settings/whatsapp. */
  defaultNotifyParent: boolean
  recordPaymentAction: (input: RecordPaymentInput) => Promise<ManualPaymentResult>
  settleAction: (input: SettleBalanceInput) => Promise<SettleBalanceResult>
  waiveAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
  voidAction: (chargeId: string, reason: string) => Promise<{ error: string | null }>
}

/**
 * One row, one obvious action.
 *
 * Every open charge used to show three buttons — record payment, waive, void —
 * of which the tutor wants the first roughly always. Waiving and voiding are
 * corrections, so they move behind the overflow menu where corrections live,
 * alongside settling the parent's whole balance — a shortcut, not a correction,
 * but one that acts beyond this row and so should not look like a row button.
 *
 * The dialogs sit outside the menu on purpose: a dialog opened from inside a
 * DropdownMenuItem unmounts with the menu the moment it closes.
 */
export function ChargeRowActions({
  chargeId,
  remaining,
  isOwner,
  hasPaymentLink,  parent,
  parentBalance,
  defaultNotifyParent,
  recordPaymentAction,
  settleAction,
  waiveAction,
  voidAction,
}: ChargeRowActionsProps) {
  const t = useTranslations('charges.resolve')
  const tSettle = useTranslations('charges.settleBalance')
  const tCommon = useTranslations('common')
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)

  const canSettle = Boolean(parentBalance && parentBalance.count > 1)

  return (
    <div className="flex items-center gap-1">
      <RecordPaymentDialog
        chargeId={chargeId}
        remaining={remaining}
        parentHasPhone={parent.hasPhone}
        defaultNotifyParent={defaultNotifyParent}
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
          {canSettle && (
            <>
              <DropdownMenuItem onSelect={() => setSettleOpen(true)}>
                <CheckCheck size={13} className="me-2" />
                {tSettle('menuAction')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
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

      {canSettle && parentBalance && (
        <SettleBalanceDialog
          parentId={parent.id}
          parentName={parent.name}
          total={parentBalance.total}
          chargeCount={parentBalance.count}
          parentHasPhone={parent.hasPhone}
          defaultNotifyParent={defaultNotifyParent}
          action={settleAction}
          open={settleOpen}
          onOpenChange={setSettleOpen}
        />
      )}

      <ResolveChargeDialog
        chargeId={chargeId}
        mode="waive"
        action={waiveAction}
        hasPaymentLink={hasPaymentLink}        open={waiveOpen}
        onOpenChange={setWaiveOpen}
      />
      {isOwner && (
        <ResolveChargeDialog
          chargeId={chargeId}
          mode="void"
          action={voidAction}
          hasPaymentLink={hasPaymentLink}          open={voidOpen}
          onOpenChange={setVoidOpen}
        />
      )}
    </div>
  )
}
