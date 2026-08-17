'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Star, Phone, BellOff } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Button } from '@/components/ui/button'
import { ParentForm } from './ParentForm'
import { SendPaymentRequestButton } from './SendPaymentRequestButton'
import { cn } from '@/lib/utils'
import {
  fetchParentForSheet,
  updateParent,
  archiveParent,
  restoreParent,
  sendPaymentRequestAction,
  type ParentSheetData,
} from '@/app/(dashboard)/parents/actions'
import type { Parent } from '@/lib/parents'

interface ParentDetailSheetProps {
  parentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  role: 'owner' | 'admin' | 'teacher'
  /** Optional: optimistic name from list row, shown while loading */
  initialName?: string
}

type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: ParentSheetData }
  | { status: 'error'; message: string }

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{title}</p>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground shrink-0 min-w-[90px]">{label}</dt>
      <dd className="text-right font-medium break-words">{children}</dd>
    </div>
  )
}

export function ParentDetailSheet({
  parentId,
  open,
  onOpenChange,
  role,
  initialName,
}: ParentDetailSheetProps) {
  const t = useTranslations('parents')
  const tStudents = useTranslations('students')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [state, setState] = useState<SheetState>({ status: 'idle' })
  const [editing, setEditing] = useState(false)

  const canMutate = role === 'owner' || role === 'admin'
  const canSendPaymentRequest = canMutate

  useEffect(() => {
    if (!open || !parentId) {
      setState({ status: 'idle' })
      setEditing(false)
      return
    }
    setState({ status: 'loading' })
    fetchParentForSheet(parentId).then((result) => {
      if ('error' in result) {
        setState({ status: 'error', message: result.error })
      } else {
        setState({ status: 'loaded', data: result.data })
      }
    })
  }, [open, parentId])

  const updateAction = useMemo(
    () => (parentId ? updateParent.bind(null, parentId) : null),
    [parentId]
  )
  const archiveAction = useMemo(
    () => (parentId ? archiveParent.bind(null, parentId) : null),
    [parentId]
  )
  const restoreAction = useMemo(
    () => (parentId ? restoreParent.bind(null, parentId) : null),
    [parentId]
  )

  function handleSaved() {
    setEditing(false)
    if (parentId) {
      fetchParentForSheet(parentId).then((result) => {
        if ('data' in result) setState({ status: 'loaded', data: result.data })
      })
    }
    router.refresh()
  }

  const displayName =
    state.status === 'loaded' ? state.data.parent.full_name : (initialName ?? '…')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[520px] p-0 flex flex-col min-w-0 gap-0 overflow-hidden"
        dir="rtl"
      >
        <SheetTitle className="sr-only">{displayName}</SheetTitle>

        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border bg-muted/20 flex items-center gap-3 min-w-0">
          <UserAvatar name={displayName} size="md" className="w-12 h-12 shrink-0 text-base" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground leading-snug truncate">{displayName}</h2>
            {state.status === 'loaded' && (
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm text-muted-foreground font-mono truncate" dir="ltr">
                  {state.data.parent.phone}
                </p>
                {state.data.parent.opted_out_at && (
                  <span
                    title={t('optedOutTooltip')}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                  >
                    <BellOff size={11} className="shrink-0" />
                    {t('optedOut')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {state.status === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          )}

          {state.status === 'error' && (
            <p className="text-sm text-destructive text-center py-8">{state.message}</p>
          )}

          {state.status === 'loaded' && (() => {
            const { parent, linkedStudents, debt } = state.data
            return (
              <>
                {/* Contact details */}
                <SectionCard title={tStudents('card.contactDetails')}>
                  <dl className="divide-y divide-border/60">
                    <DataRow label={t('fields.phone')}>
                      <a
                        href={`tel:${parent.phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline font-mono"
                        dir="ltr"
                      >
                        <Phone size={12} className="shrink-0 opacity-60" />
                        {parent.phone}
                      </a>
                    </DataRow>
                    {parent.second_phone && (
                      <DataRow label={t('fields.secondPhone')}>
                        <a href={`tel:${parent.second_phone}`} className="font-mono text-primary hover:underline" dir="ltr">
                          {parent.second_phone}
                        </a>
                      </DataRow>
                    )}
                    {parent.email && (
                      <DataRow label={t('fields.email')}>
                        <a href={`mailto:${parent.email}`} className="text-primary hover:underline break-all" dir="ltr">
                          {parent.email}
                        </a>
                      </DataRow>
                    )}
                    {parent.relation_type && (
                      <DataRow label={t('fields.relationType')}>
                        {parent.relation_type === 'mother' ? t('fields.relationTypeMother')
                          : parent.relation_type === 'father' ? t('fields.relationTypeFather')
                          : parent.relation_type === 'guardian' ? t('fields.relationTypeGuardian')
                          : t('fields.relationTypeOther')}
                      </DataRow>
                    )}
                    {parent.address && (
                      <DataRow label={t('fields.address')}>
                        {parent.address}
                      </DataRow>
                    )}
                  </dl>
                </SectionCard>

                {/* Linked students */}
                <SectionCard title={t('connectedStudents')}>
                  {linkedStudents.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-muted-foreground text-center">{t('noLinkedStudents')}</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {linkedStudents.map((rel) => (
                        <li key={rel.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-3 min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Link
                                href={`/students/${rel.student.id}`}
                                onClick={() => onOpenChange(false)}
                                className="text-sm font-medium text-foreground hover:text-primary truncate"
                              >
                                {rel.student.full_name}
                              </Link>
                              {rel.student.grade && (
                                <span className="text-xs text-muted-foreground shrink-0">{rel.student.grade}</span>
                              )}
                            </div>
                            {rel.is_primary && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                <Star size={10} aria-hidden />
                                {t('primaryBadge')}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                {/* Balance */}
                <SectionCard title={t('balance')}>
                  <div className="px-4 py-4 flex items-center justify-between gap-3">
                    <span
                      className={cn('text-lg font-bold tabular-nums', debt > 0 ? 'text-destructive' : 'text-muted-foreground')}
                      dir="ltr"
                    >
                      {debt > 0 ? `₪${debt.toFixed(2)}` : t('noDebt')}
                    </span>
                    {debt > 0 && (
                      <Link
                        href={`/charges?parent=${parent.id}`}
                        onClick={() => onOpenChange(false)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {t('viewCharges')}
                      </Link>
                    )}
                  </div>
                </SectionCard>

                {/* Notes */}
                {parent.notes && (
                  <SectionCard title={t('fields.notes')}>
                    <div className="px-4 py-4">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">
                        {parent.notes}
                      </p>
                    </div>
                  </SectionCard>
                )}

                {/* Actions */}
                {canMutate && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing((v) => !v)}
                      className="gap-1.5"
                    >
                      {editing ? tCommon('actions.cancel') : t('edit')}
                    </Button>
                    {canSendPaymentRequest && parent.is_active && (
                      <SendPaymentRequestButton parentId={parent.id} action={sendPaymentRequestAction} />
                    )}
                    {parent.is_active && archiveAction ? (
                      <form action={archiveAction} onSubmit={() => onOpenChange(false)}>
                        <Button variant="outline" size="sm" type="submit" className="text-destructive border-destructive/30 hover:bg-destructive/5">
                          {t('archive')}
                        </Button>
                      </form>
                    ) : restoreAction ? (
                      <form action={restoreAction} onSubmit={() => onOpenChange(false)}>
                        <Button variant="outline" size="sm" type="submit" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                          {t('restore')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                )}

                {/* Edit form */}
                {editing && updateAction && (
                  <SectionCard title={t('editParent')}>
                    <div className="p-4">
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
                        onSuccess={handleSaved}
                        onCancel={() => setEditing(false)}
                      />
                    </div>
                  </SectionCard>
                )}
              </>
            )
          })()}
        </div>
      </SheetContent>
    </Sheet>
  )
}
