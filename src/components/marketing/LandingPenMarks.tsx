import type { SVGProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The diary's icon system: four marks a pen makes on ruled paper. Each is one
 * or two strokes with a slight hand wobble, round caps, and the same line
 * weight as the strike on the week spread. No icon library glyphs anywhere on
 * the page; these are the only icons.
 */
type MarkProps = SVGProps<SVGSVGElement> & { className?: string }

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

/** A tick, drawn short-then-long like a checkmark on a list. */
export function PenCheck({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} {...props}>
      <path d="M4.5 13.2 C 7 15.5, 8.6 17.4, 9.6 19 C 12 13.5, 15.4 8.6, 20.4 4.8" {...base} />
    </svg>
  )
}

/** A cross: two quick diagonal strokes that do not quite meet at the centre. */
export function PenX({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} {...props}>
      <path d="M5.5 5.2 C 9.5 9.6, 14 14.4, 18.8 18.9" {...base} />
      <path d="M18.6 5.4 C 14.2 9.4, 9.8 13.8, 5.3 18.7" {...base} />
    </svg>
  )
}

/** A plus, horizontal stroke slightly longer, as when adding a note. */
export function PenPlus({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} {...props}>
      <path d="M12.2 4.6 C 12 9.2, 12 14.6, 11.8 19.4" {...base} />
      <path d="M4.4 12.2 C 9.4 11.9, 14.6 12, 19.8 11.9" {...base} />
    </svg>
  )
}

/** The pen's underline beneath a page title: one stroke, drawn slightly uphill. */
export function PenUnderline({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden className={className} {...props}>
      <path d="M3 8.5 C 40 6.5, 80 9.5, 120 7 S 180 5.5, 197 6.8" {...base} />
    </svg>
  )
}

/** A paperclip, one continuous stroke, holding a printout to the page. */
export function PenClip({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 24 48" aria-hidden className={cn('h-12 w-6', className)} {...props}>
      <path
        d="M16.5 10 V 34 a 4.5 4.5 0 0 1 -9 0 V 12 a 3 3 0 0 1 6 0 V 32 a 1.2 1.2 0 0 1 -2.4 0 V 14"
        {...base}
        strokeWidth={1.9}
      />
    </svg>
  )
}
