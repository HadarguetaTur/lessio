'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, RefreshCw, SkipForward } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import type { OpenerReviewRow } from '@/lib/outbound/opener'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

/**
 * The gate between the model and a real person's inbox.
 *
 * Every row here is a prospect the sender cannot touch yet. Approving writes
 * the line as `personal_line` and releases the prospect; skipping approves an
 * empty line, which sends the campaign body without an opener.
 */

type ActionFn = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

export function OutboundOpenerReview({
  rows,
  approveAction,
  regenerateAction,
}: {
  rows: OpenerReviewRow[]
  approveAction: ActionFn
  regenerateAction: ActionFn
}) {
  const t = useTranslations('admin.outbound.opener')

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 text-base font-semibold">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <OpenerRow key={row.id} row={row} approveAction={approveAction} regenerateAction={regenerateAction} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function OpenerRow({
  row,
  approveAction,
  regenerateAction,
}: {
  row: OpenerReviewRow
  approveAction: ActionFn
  regenerateAction: ActionFn
}) {
  const t = useTranslations('admin.outbound.opener')
  const [approveState, approve, approving] = useActionState(approveAction, null)
  const [regenState, regenerate, regenerating] = useActionState(regenerateAction, null)
  const [text, setText] = useState(row.opener_generated ?? '')

  // A fresh draft arrives in the action's result rather than through a reload.
  const draft = regenState?.detail ?? text

  return (
    <li className="py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs" dir="ltr">
            {row.email}
          </span>
          {row.company && <span className="ms-2 text-sm text-muted-foreground">{row.company}</span>}
        </div>
        <div className="flex items-center gap-2">
          {row.source_url && (
            <a
              href={row.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground underline underline-offset-2"
              dir="ltr"
            >
              {t('source')}
            </a>
          )}
          <ProspectStatusBadge status={row.opener_status} label={t(`status.${row.opener_status}`)} />
        </div>
      </div>

      {row.opener_error && (
        <p className="mb-2 text-xs text-destructive">{t(`errors.${row.opener_error}`)}</p>
      )}

      <form action={approve} className="flex flex-col gap-2">
        <input type="hidden" name="prospectId" value={row.id} />
        <Textarea
          name="text"
          rows={2}
          value={draft}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={approving}>
            {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {t('approve')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={regenerating}
            onClick={() => {
              const fd = new FormData()
              fd.set('prospectId', row.id)
              regenerate(fd)
            }}
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('regenerate')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={approving}
            onClick={() => {
              const fd = new FormData()
              fd.set('prospectId', row.id)
              approve(fd)
            }}
          >
            <SkipForward size={14} />
            {t('skip')}
          </Button>
          {approveState?.error && <span className="text-xs text-destructive">{t('saveFailed')}</span>}
          {regenState?.error && <span className="text-xs text-destructive">{t('saveFailed')}</span>}
        </div>
      </form>
    </li>
  )
}
