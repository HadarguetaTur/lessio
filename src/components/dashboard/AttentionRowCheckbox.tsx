'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttentionActionResult } from '@/app/(dashboard)/dashboard/actions'

export interface AttentionRowCheck {
  id: string
  action: (id: string) => Promise<AttentionActionResult>
  /** Accessible name for the checkbox, already translated by the server parent. */
  label: string
  /** Generic failure toast, already translated — shown when the action throws. */
  failureLabel: string
}

interface AttentionCheckRowProps extends AttentionRowCheck {
  href: string
  children: React.ReactNode
}

/** How long the green "done" state stays on screen before the row folds away. */
const DONE_HOLD_MS = 800

type Phase = 'idle' | 'pending' | 'done' | 'gone'

/**
 * Row shell + "done" tick as one client component, so the whole interaction
 * plays out locally: spinner while the action runs, a green check popping in
 * with the row flashing green and its text struck through, then the row folds
 * away — the revalidate that follows reconciles the counts. On failure the
 * tick reverts and the reason lands as a toast, including a thrown action,
 * which would otherwise die silently inside the transition.
 */
export function AttentionCheckRow({
  id,
  action,
  label,
  failureLabel,
  href,
  children,
}: AttentionCheckRowProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [, startTransition] = useTransition()

  const handleClick = () => {
    if (phase !== 'idle') return
    setPhase('pending')
    startTransition(async () => {
      let result: AttentionActionResult
      try {
        result = await action(id)
      } catch {
        result = { error: failureLabel }
      }
      if (result.error) {
        setPhase('idle')
        toast.error(result.error)
        return
      }
      if (result.chargeAlert) {
        toast.warning(result.chargeAlert)
      }
      setPhase('done')
      setTimeout(() => {
        setPhase('gone')
        router.refresh()
      }, DONE_HOLD_MS)
    })
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 overflow-hidden rounded-lg px-2 transition-all duration-300 ease-in-out',
        phase === 'gone' ? 'max-h-0 py-0 opacity-0' : 'max-h-14 py-1.5',
        phase === 'done' && 'bg-emerald-50 dark:bg-emerald-950/40',
        phase === 'idle' && 'hover:bg-muted/50'
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={phase === 'done' || phase === 'gone'}
        aria-label={label}
        title={label}
        disabled={phase !== 'idle'}
        onClick={handleClick}
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] transition-all duration-150',
          phase === 'idle' &&
            'cursor-pointer border-2 border-muted-foreground/40 bg-background hover:scale-110 hover:border-emerald-500',
          phase === 'pending' && 'text-emerald-600',
          (phase === 'done' || phase === 'gone') && 'bg-emerald-500 text-white'
        )}
      >
        {phase === 'pending' && <Loader2 size={14} className="animate-spin" />}
        {(phase === 'done' || phase === 'gone') && (
          <Check size={13} strokeWidth={3} className="animate-in zoom-in-50 duration-200" />
        )}
      </button>
      <Link
        href={href}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-200',
          (phase === 'done' || phase === 'gone') && 'line-through opacity-60'
        )}
      >
        {children}
      </Link>
    </div>
  )
}
