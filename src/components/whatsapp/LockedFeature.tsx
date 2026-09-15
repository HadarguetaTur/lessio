'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ExternalLink, Info, Lock } from 'lucide-react'
import type { LockedFeatureInfo, WaUnlock } from '@/lib/whatsapp/capabilities'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * "Why is this closed, what opens it, and how will I know?" — asked once,
 * answered the same way everywhere.
 *
 * Three pieces, one vocabulary. The trigger wraps whatever is locked (a nav
 * segment, a radio, a link) and adds the lock; the dialog is the explanation;
 * the notice is the same explanation laid into the page, where the neutral
 * empty state used to sit and say "no broadcasts yet" to someone whose plan
 * had none.
 *
 * Every string comes from `whatsappCapability.<reason>` with `{cap}` and
 * `{until}` filled in, so a new reason is a row in the copy table and a case
 * in the resolver, never a new component.
 */

type Props = { info: LockedFeatureInfo; canFix?: boolean }

/** Unlocks that put a button on screen; the rest are "wait" or "ask" and get none. */
const LINKED_UNLOCKS: ReadonlySet<WaUnlock> = new Set<WaUnlock>([
  'upgrade_plan',
  'renew_subscription',
  'connect_number',
  'reconnect_number',
  'verify_business',
  'approve_templates',
])

function useCopy(info: LockedFeatureInfo) {
  const t = useTranslations('whatsappCapability')
  const reason = info.reason ?? 'unreachable'
  const values = { cap: info.cap ?? 0, until: info.untilLabel ?? '' }
  return {
    t,
    title: t(`${reason}.title`),
    body: t(`${reason}.body`, values),
    unlock: t(`${reason}.unlock`, values),
    howYouKnow: t(`${reason}.howYouKnow`, values),
    cta: LINKED_UNLOCKS.has(info.unlock) && info.unlockHref ? t(`cta.${info.unlock}`) : null,
  }
}

function UnlockButton({ info, label }: { info: LockedFeatureInfo; label: string }) {
  const className =
    'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90'
  if (!info.unlockHref) return null
  if (info.unlock === 'verify_business') {
    return (
      <a href={info.unlockHref} target="_blank" rel="noreferrer" className={className}>
        {label}
        <ExternalLink size={14} aria-hidden />
      </a>
    )
  }
  return (
    <Link href={info.unlockHref} className={className}>
      {label}
    </Link>
  )
}

function Sections({ info, canFix }: Props) {
  const copy = useCopy(info)
  const limited = info.status === 'limited'
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          {copy.t(limited ? 'headings.limitedWhy' : 'headings.why')}
        </p>
        <p className="mt-0.5 text-foreground">{copy.body}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{copy.t('headings.unlock')}</p>
        <p className="mt-0.5 text-foreground">{copy.unlock}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{copy.t('headings.howYouKnow')}</p>
        <p className="mt-0.5 text-foreground">{copy.howYouKnow}</p>
      </div>
      {copy.cta && canFix && (
        <div className="pt-1">
          <UnlockButton info={info} label={copy.cta} />
        </div>
      )}
    </div>
  )
}

export function LockedFeatureDialog({
  info,
  canFix = true,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const copy = useCopy(info)
  const Icon = info.status === 'limited' ? Info : Lock
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={16} aria-hidden className="text-muted-foreground" />
            {copy.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{copy.body}</DialogDescription>
        </DialogHeader>
        <Sections info={info} canFix={canFix} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Wraps a locked control. The child is rendered as-is inside a button that
 * opens the dialog, with the lock icon after it — so a nav segment still
 * looks like a nav segment and a link still reads like a link.
 */
export function LockedFeatureTrigger({
  info,
  canFix = true,
  children,
  className,
  showIcon = true,
  'aria-current': ariaCurrent,
}: Props & {
  children: ReactNode
  className?: string
  showIcon?: boolean
  'aria-current'?: 'page'
}) {
  const t = useTranslations('whatsappCapability')
  const [open, setOpen] = useState(false)
  const limited = info.status === 'limited'
  const Icon = limited ? Info : Lock
  return (
    <>
      {/* A real button, not aria-disabled: pressing it does something — it explains. */}
      <button type="button" onClick={() => setOpen(true)} aria-current={ariaCurrent} className={className}>
        {children}
        {showIcon && (
          <Icon
            size={13}
            role="img"
            aria-label={limited ? t('details') : t('lockedBadge')}
            className="shrink-0 opacity-70"
          />
        )}
      </button>
      <LockedFeatureDialog info={info} canFix={canFix} open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * The explanation as page content. Replaces an empty state when the feature
 * is locked, and sits above the content as a short line when it is limited.
 */
export function LockedFeatureNotice({ info, canFix = true, compact = false }: Props & { compact?: boolean }) {
  const copy = useCopy(info)
  const [open, setOpen] = useState(false)
  const limited = info.status === 'limited'
  const Icon = limited ? Info : Lock

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
        <Icon size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{copy.title}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-primary underline underline-offset-4"
        >
          {copy.t('details')}
        </button>
        <LockedFeatureDialog info={info} canFix={canFix} open={open} onOpenChange={setOpen} />
      </div>
    )
  }

  return (
    <section
      role="status"
      className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-card p-5"
    >
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon size={16} aria-hidden className="text-muted-foreground" />
        {copy.title}
      </h3>
      <div className="mt-3">
        <Sections info={info} canFix={canFix} />
      </div>
    </section>
  )
}
