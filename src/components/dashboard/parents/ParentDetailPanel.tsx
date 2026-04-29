'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil, Star, Phone } from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import { ParentForm } from './ParentForm'
import { SendPaymentRequestButton } from './SendPaymentRequestButton'
import { cn } from '@/lib/utils'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type PaymentAction = (parentId: string) => Promise<{ error: string | null }>

export interface ParentDetailPanelProps {
  parent: {
    id: string
    full_name: string
    phone: string
    notes: string | null
    is_active: boolean
  }
  linkedStudents: Array<{
    id: string
    is_primary: boolean
    student: { id: string; full_name: string; grade: string | null }
  }>
  debt: number
  updateAction: FormAction
  paymentAction?: PaymentAction
  canSendPaymentRequest: boolean
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-3 border-b border-border bg-muted/30">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
    </div>
  )
}

export function ParentDetailPanel({
  parent,
  linkedStudents,
  debt,
  updateAction,
  paymentAction,
  canSendPaymentRequest,
}: ParentDetailPanelProps) {
  const [editing, setEditing] = useState(false)
  const router = useRouter()
  const t = useTranslations('parents')
  const tCommon = useTranslations('common')

  const handleSaved = () => {
    setEditing(false)
    router.refresh()
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 min-w-0">
            <UserAvatar name={parent.full_name} size="md" className="w-14 h-14 shrink-0 text-base" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h1 className="text-xl font-bold text-foreground leading-snug break-words">
                  {parent.full_name}
                </h1>
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0',
                    parent.is_active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-muted text-muted-foreground border-border',
                  )}
                >
                  {parent.is_active ? t('statusActive') : t('statusInactive')}
                </span>
              </div>
              <a
                href={`tel:${parent.phone}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors w-fit max-w-full break-all font-mono"
                dir="ltr"
              >
                <Phone size={14} className="shrink-0 opacity-70" />
                {parent.phone}
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil size={13} />
              {editing ? tCommon('actions.cancel') : t('edit')}
            </Button>
            {canSendPaymentRequest && parent.is_active && paymentAction ? (
              <SendPaymentRequestButton parentId={parent.id} action={paymentAction} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <SectionHeader title={t('connectedStudents')} />
        <div className="p-0">
          {linkedStudents.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">{t('noLinkedStudents')}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {linkedStudents.map((rel) => (
                <li key={rel.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                      <Link
                        href={`/students/${rel.student.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary break-words min-w-0"
                      >
                        {rel.student.full_name}
                      </Link>
                      {rel.student.grade ? (
                        <span className="text-xs text-muted-foreground shrink-0">{rel.student.grade}</span>
                      ) : null}
                    </div>
                    {rel.is_primary ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                        <Star size={11} className="shrink-0" aria-hidden />
                        {t('primaryBadge')}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <SectionHeader title={t('balance')} />
        <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span
            className={cn('text-lg font-bold tabular-nums', debt > 0 ? 'text-destructive' : 'text-muted-foreground')}
            dir="ltr"
          >
            {debt > 0 ? `₪${debt.toFixed(2)}` : t('noDebt')}
          </span>
          {debt > 0 ? (
            <Link
              href={`/charges?parent=${parent.id}`}
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              {t('viewCharges')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <SectionHeader title={t('fields.notes')} />
        <div className="px-4 py-4 min-h-[4.5rem]">
          {parent.notes?.trim() ? (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">{parent.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">{t('emptyNotes')}</p>
          )}
        </div>
      </div>

      {editing ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <SectionHeader title={t('editParent')} />
          <div className="p-4 sm:p-5">
            <ParentForm
              action={updateAction}
              defaultValues={{
                full_name: parent.full_name,
                phone: parent.phone,
                notes: parent.notes,
              }}
              onSuccess={handleSaved}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
