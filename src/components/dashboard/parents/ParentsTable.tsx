'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ParentsTableRow } from './ParentsTableRow'
import { ParentDetailSheet } from './ParentDetailSheet'
import type { Parent } from '@/lib/parents'

type ActionState = { error: string } | null
type BoundFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type UnboundUpdateAction = (id: string, prevState: ActionState, formData: FormData) => Promise<ActionState>
type VoidAction = (id: string) => Promise<void>
type PaymentAction = (parentId: string) => Promise<{ error: string | null }>

interface ParentsTableProps {
  parents: Parent[]
  role: 'owner' | 'admin' | 'teacher'
  headingName: string
  headingPhone: string
  headingStatus: string
  statusActiveLabel: string
  statusInactiveLabel: string
  updateAction: UnboundUpdateAction
  archiveAction: VoidAction
  restoreAction: VoidAction
  paymentAction: PaymentAction
}

export function ParentsTable({
  parents,
  role,
  headingName,
  headingPhone,
  headingStatus,
  statusActiveLabel,
  statusInactiveLabel,
  updateAction,
  archiveAction,
  restoreAction,
  paymentAction,
}: ParentsTableProps) {
  const tActions = useTranslations('common')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined)
  const [sheetOpen, setSheetOpen] = useState(false)

  const isTeacher = role === 'teacher'
  const canSendPaymentRequest = role === 'owner' || role === 'admin'

  function handleRowClick(parent: Parent) {
    if (isTeacher) return
    setSelectedId(parent.id)
    setSelectedName(parent.full_name)
    setSheetOpen(true)
  }

  return (
    <>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-full overflow-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingName}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingPhone}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/95 px-5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {headingStatus}
                </TableHead>
                <TableHead className="sticky top-0 w-12 bg-muted/95 px-5 backdrop-blur">
                  <span className="sr-only">{tActions('table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parents.map((parent) => {
                const boundUpdate: BoundFormAction = (prevState, formData) =>
                  updateAction(parent.id, prevState, formData)
                const boundArchive = () => archiveAction(parent.id)
                const boundRestore = () => restoreAction(parent.id)
                return (
                <ParentsTableRow
                  key={parent.id}
                  parent={parent}
                  isTeacher={isTeacher}
                  canSendPaymentRequest={canSendPaymentRequest}
                  statusActiveLabel={statusActiveLabel}
                  statusInactiveLabel={statusInactiveLabel}
                  updateAction={boundUpdate}
                  archiveAction={boundArchive}
                  restoreAction={boundRestore}
                  paymentAction={paymentAction}
                  onRowClick={handleRowClick}
                />
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <ParentDetailSheet
        parentId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        role={role}
        initialName={selectedName}
      />
    </>
  )
}
