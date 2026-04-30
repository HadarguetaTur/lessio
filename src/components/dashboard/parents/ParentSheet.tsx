'use client'

import { useState, useActionState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Archive, RotateCcw, MoreHorizontal, MessageSquare, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { updateParentNotesAsTeacher, updateParentAsTeacher } from '@/app/(dashboard)/parents/actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ParentForm } from './ParentForm'
import { SendPaymentRequestButton } from './SendPaymentRequestButton'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type VoidAction = () => Promise<void>
type PaymentAction = (parentId: string) => Promise<{ error: string | null }>

// ── "New Parent" button + Sheet ───────────────────────────────────────────────

interface NewParentSheetProps {
  action: FormAction
}

export function NewParentSheet({ action }: NewParentSheetProps) {
  const t = useTranslations('parents')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={15} className="ml-1.5" />
        {t('newParent')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('newParent')}</SheetTitle>
            <SheetDescription>{t('newParentDescription')}</SheetDescription>
          </SheetHeader>
          <ParentForm
            action={action}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ── Row actions: DropdownMenu + Edit Sheet ────────────────────────────────────

interface ParentRowActionsProps {
  parent: {
    id: string
    full_name: string
    phone: string
    email?: string | null
    second_phone?: string | null
    address?: string | null
    relation_type?: string | null
    notes?: string | null
    is_active: boolean
  }
  updateAction: FormAction
  archiveAction: VoidAction
  restoreAction: VoidAction
  paymentAction?: PaymentAction
  canSendPaymentRequest?: boolean
}

export function ParentRowActions({
  parent,
  updateAction,
  archiveAction,
  restoreAction,
  paymentAction,
  canSendPaymentRequest,
}: ParentRowActionsProps) {
  const t = useTranslations('parents')
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil size={13} className="ml-2" />
            {t('edit')}
          </DropdownMenuItem>
          {canSendPaymentRequest && parent.is_active && paymentAction && (
            <div className="px-2 py-1">
              <SendPaymentRequestButton parentId={parent.id} action={paymentAction} />
            </div>
          )}
          <DropdownMenuSeparator />
          {parent.is_active ? (
            <DropdownMenuItem asChild>
              <form action={archiveAction} className="w-full">
                <button type="submit" className="flex items-center gap-2 w-full text-destructive">
                  <Archive size={13} />
                  {t('archive')}
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <form action={restoreAction} className="w-full">
                <button type="submit" className="flex items-center gap-2 w-full text-emerald-600">
                  <RotateCcw size={13} />
                  {t('restore')}
                </button>
              </form>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('editParent')}</SheetTitle>
            <SheetDescription>{parent.full_name}</SheetDescription>
          </SheetHeader>
          <ParentForm
            action={updateAction}
            defaultValues={{
              full_name: parent.full_name,
              phone: parent.phone,
              email: parent.email,
              second_phone: parent.second_phone,
              address: parent.address,
              relation_type: parent.relation_type,
              notes: parent.notes,
            }}
            onCancel={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ── Teacher: full contact edit (linked parents only) ──────────────────────────

export function TeacherParentNotesRowActions({
  parent,
}: {
  parent: {
    id: string
    full_name: string
    phone: string
    email?: string | null
    second_phone?: string | null
    address?: string | null
    relation_type?: string | null
    notes?: string | null
  }
}) {
  const t = useTranslations('parents')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const editAction = useMemo(() => updateParentAsTeacher.bind(null, parent.id), [parent.id])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label={t('editParent')}
      >
        <Pencil size={15} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('editParent')}</SheetTitle>
            <SheetDescription>{parent.full_name}</SheetDescription>
          </SheetHeader>
          <ParentForm
            action={editAction}
            defaultValues={{
              full_name: parent.full_name,
              phone: parent.phone,
              email: parent.email,
              second_phone: parent.second_phone,
              address: parent.address,
              relation_type: parent.relation_type,
              notes: parent.notes,
            }}
            onSuccess={() => { setOpen(false); router.refresh() }}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
