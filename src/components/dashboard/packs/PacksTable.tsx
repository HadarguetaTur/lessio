'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { PackListItem } from '@/lib/billing/packs/manage'
import type { PackStatus } from '@/lib/billing/packs/status'
import type { PackActionResult } from '@/app/(dashboard)/packs/actions'

interface Props {
  packs: PackListItem[]
  lowThreshold: number
  isOwner: boolean
  openId: string | null
  cancelAction: (input: { packId: string; reason: string; force?: boolean }) => Promise<PackActionResult>
  adjustAction: (input: { packId: string; delta: number; reason: string }) => Promise<PackActionResult>
  updateAction: (input: { packId: string; validUntil: string | null; notes: string | null }) => Promise<PackActionResult>
}

const BADGE: Record<PackStatus, string> = {
  active: 'completed',
  pending_payment: 'scheduled',
  exhausted: 'no_show',
  expired: 'no_show',
  cancelled: 'cancelled',
}

const INPUT =
  'w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring'

type Panel = 'cancel' | 'adjust' | 'extend'

export function PacksTable({ packs, lowThreshold, isOwner, openId, cancelAction, adjustAction, updateAction }: Props) {
  const t = useTranslations('packs')
  const locale = useLocale()
  const [open, setOpen] = useState<{ id: string; panel: Panel } | null>(null)

  const fmtDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(
          new Date(`${iso}T12:00:00Z`)
        )
      : null

  const paymentLabel = (pack: PackListItem) => {
    if (!pack.charge_id) return pack.price > 0 ? t('payment.monthly') : t('payment.free')
    if (pack.charge?.refunded_at) return t('refundedBadge')
    return pack.charge?.status === 'paid' ? t('payment.paid') : t('payment.pending')
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="h-full overflow-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['holder', 'card', 'balance', 'validity', 'payment', 'status', 'actions'].map((col) => (
                <th
                  key={col}
                  className="sticky top-0 z-10 bg-muted/95 px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
                >
                  {t(`columns.${col}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {packs.map((pack) => {
              const holder = pack.student_id
                ? pack.studentName ?? '—'
                : t('family', { parent: pack.parentName ?? '—' })
              const studentLink = pack.billing_student_id ? `/students?openStudent=${pack.billing_student_id}` : null
              const low = pack.status === 'active' && pack.remaining <= lowThreshold
              const isOpen = open?.id === pack.id
              return (
                <tr key={pack.id} className={pack.id === openId ? 'bg-amber-50/60' : 'hover:bg-muted/20'}>
                  <td className="px-4 py-3 align-top text-sm font-medium">
                    {studentLink ? <Link href={studentLink} className="hover:underline">{holder}</Link> : holder}
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    {pack.name}
                    <span className="block text-xs text-muted-foreground tabular-nums">{formatMoney(pack.price, locale)}</span>
                  </td>
                  <td className="px-4 py-3 align-top text-sm tabular-nums">
                    {t('balance', { remaining: pack.remaining, total: pack.total_credits })}
                    {low && <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{t('lowBadge')}</span>}
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    {pack.valid_until ? t('validUntil', { date: fmtDate(pack.valid_until)! }) : t('noExpiry')}
                  </td>
                  <td className="px-4 py-3 align-top text-sm">
                    {pack.charge_id ? <Link href={`/charges/${pack.charge_id}`} className="hover:underline">{paymentLabel(pack)}</Link> : paymentLabel(pack)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={BADGE[pack.status]} label={t(`status.${pack.status}`)} />
                    {pack.cancel_reason && <span className="mt-1 block max-w-48 text-xs text-muted-foreground">{pack.cancel_reason}</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {pack.status !== 'cancelled' && (
                      <div className="flex flex-col items-start gap-1">
                        {(['adjust', 'extend', 'cancel'] as Panel[]).map((panel) => (
                          <button
                            key={panel}
                            type="button"
                            onClick={() => setOpen(isOpen && open?.panel === panel ? null : { id: pack.id, panel })}
                            className="text-xs text-primary hover:underline"
                          >
                            {t(`actions.${panel}`)}
                          </button>
                        ))}
                        {isOpen && open?.panel === 'cancel' && (
                          <CancelPanel pack={pack} isOwner={isOwner} action={cancelAction} onDone={() => setOpen(null)} />
                        )}
                        {isOpen && open?.panel === 'adjust' && (
                          <AdjustPanel pack={pack} action={adjustAction} onDone={() => setOpen(null)} />
                        )}
                        {isOpen && open?.panel === 'extend' && (
                          <ExtendPanel pack={pack} action={updateAction} onDone={() => setOpen(null)} />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CancelPanel({
  pack,
  isOwner,
  action,
  onDone,
}: {
  pack: PackListItem
  isOwner: boolean
  action: Props['cancelAction']
  onDone: () => void
}) {
  const t = useTranslations('packs')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [offerForce, setOfferForce] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(force: boolean) {
    setSaving(true)
    setError(null)
    try {
      const result = await action({ packId: pack.id, reason, force })
      if (result.error) {
        setError(result.error)
        setOfferForce(Boolean(result.force) && isOwner)
      } else onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 w-64 space-y-2 rounded-md border border-border bg-background p-3">
      <label htmlFor={`cancel-${pack.id}`} className="text-xs font-medium">{t('cancelPanel.reason')}</label>
      <input id={`cancel-${pack.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={INPUT} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={saving || !reason.trim()} onClick={() => submit(false)}>
          {t('cancelPanel.confirm')}
        </Button>
        {offerForce && (
          <Button type="button" size="sm" variant="outline" disabled={saving || !reason.trim()} onClick={() => submit(true)}>
            {t('cancelPanel.force')}
          </Button>
        )}
      </div>
      {offerForce && pack.charge_id && (
        <Link href={`/charges/${pack.charge_id}`} className="block text-xs text-primary hover:underline">{t('cancelPanel.openCharge')}</Link>
      )}
    </div>
  )
}

function AdjustPanel({ pack, action, onDone }: { pack: PackListItem; action: Props['adjustAction']; onDone: () => void }) {
  const t = useTranslations('packs')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const value = Number(delta)
    if (!Number.isInteger(value) || value === 0) {
      setError(t('errors.invalid_delta'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await action({ packId: pack.id, delta: value, reason })
      if (result.error) setError(result.error)
      else onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 w-64 space-y-2 rounded-md border border-border bg-background p-3">
      <label htmlFor={`delta-${pack.id}`} className="text-xs font-medium">{t('adjustPanel.delta')}</label>
      <input id={`delta-${pack.id}`} type="number" step="1" dir="ltr" value={delta} onChange={(e) => setDelta(e.target.value)} className={INPUT} />
      <label htmlFor={`adjust-reason-${pack.id}`} className="text-xs font-medium">{t('adjustPanel.reason')}</label>
      <input id={`adjust-reason-${pack.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={INPUT} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={saving || !reason.trim()} onClick={submit}>{t('adjustPanel.confirm')}</Button>
    </div>
  )
}

function ExtendPanel({ pack, action, onDone }: { pack: PackListItem; action: Props['updateAction']; onDone: () => void }) {
  const t = useTranslations('packs')
  const [validUntil, setValidUntil] = useState(pack.valid_until ?? '')
  const [notes, setNotes] = useState(pack.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const result = await action({ packId: pack.id, validUntil: validUntil || null, notes: notes || null })
      if (result.error) setError(result.error)
      else onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 w-64 space-y-2 rounded-md border border-border bg-background p-3">
      <label htmlFor={`until-${pack.id}`} className="text-xs font-medium">{t('extendPanel.validUntil')}</label>
      <input id={`until-${pack.id}`} type="date" min={pack.valid_from} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={INPUT} />
      <p className="text-[11px] text-muted-foreground">{t('extendPanel.emptyMeansNoExpiry')}</p>
      <label htmlFor={`notes-${pack.id}`} className="text-xs font-medium">{t('extendPanel.notes')}</label>
      <input id={`notes-${pack.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={INPUT} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={saving} onClick={submit}>{t('extendPanel.confirm')}</Button>
    </div>
  )
}
