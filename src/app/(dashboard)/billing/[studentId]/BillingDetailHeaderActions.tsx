'use client'

import { MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MarkPaidButton } from '../MarkPaidButton'
import { ApproveBillingButton } from '../ApproveBillingButton'
import { SendBillingPaymentRequestButton } from '../SendBillingPaymentRequestButton'
import { RecalculateButton } from './RecalculateButton'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import IssueCreditNoteDialog from './IssueCreditNoteDialog'
import { downloadInvoiceAction, issueCreditNoteAction } from '../actions'

interface Props {
  studentId: string
  billingMonth: string
  billingData: {
    id: string
    is_paid: boolean
    is_approved: boolean
    invoice_number: string | null
    credit_note_number: string | null
  } | null
}

export function BillingDetailHeaderActions({
  studentId,
  billingMonth,
  billingData,
}: Props) {
  const t = useTranslations('billing.detail')

  const actions = (
    <>
      <RecalculateButton studentId={studentId} billingMonth={billingMonth} />
      {billingData && !billingData.is_paid && !billingData.is_approved && (
        <ApproveBillingButton billingId={billingData.id} />
      )}
      {billingData && !billingData.is_paid && billingData.is_approved && (
        <SendBillingPaymentRequestButton billingId={billingData.id} />
      )}
      {billingData && !billingData.is_paid && (
        <MarkPaidButton billingId={billingData.id} />
      )}
      {billingData && (
        <DownloadInvoiceButton
          billingId={billingData.id}
          hasInvoice={!!billingData.invoice_number}
          downloadAction={downloadInvoiceAction}
        />
      )}
      {billingData && (
        <IssueCreditNoteDialog
          billingId={billingData.id}
          hasInvoice={!!billingData.invoice_number}
          hasCreditNote={!!billingData.credit_note_number}
          issueCreditNoteAction={issueCreditNoteAction}
        />
      )}
    </>
  )

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2 sm:w-auto sm:items-start">
      <div className="hidden w-full min-w-0 flex-wrap items-center justify-center gap-2 sm:flex sm:justify-start">
        {actions}
      </div>
      <div className="flex w-full justify-center sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={t('actionsMenuAria')}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-[min(100vw-2rem,18rem)] p-2">
            <div className="flex flex-col gap-2 [&_button]:w-full [&_span]:text-center">{actions}</div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
