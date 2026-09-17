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

/* ── Margin doodles for the trust page: what the pen draws beside a promise ── */

/** A round seal with a tick inside: the official channel. */
export function PenSeal({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('size-12', className)} {...props}>
      <path d="M24 5.5 C 34 5, 42.5 13, 42.6 23.5 C 42.8 34.5, 34.5 42.6, 24.2 42.5 C 13.5 42.4, 5.4 34.2, 5.6 23.8 C 5.8 13.6, 13.8 6, 24 5.5 Z" {...base} />
      <path d="M15.5 24.5 C 18 26.6, 19.6 28.4, 20.8 30.4 C 23.5 25.4, 27 21, 32.6 16.6" {...base} />
    </svg>
  )
}

/** A speech bubble the pen has hushed: a wavy sleep line where the words would be. */
export function PenQuietBubble({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('size-12', className)} {...props}>
      <path d="M9 9.5 C 20 8.6, 30 8.8, 39.5 9.6 C 40.6 15.5, 40.4 22, 39.3 29.2 C 32 29.8, 25 29.6, 19.5 29.6 C 16.8 33, 14.3 36, 11 39 C 11.6 35.6, 11.8 32.6, 11.9 29.4 C 9.6 29.2, 8.4 29, 8.2 28.8 C 7.8 22, 8 15.6, 9 9.5 Z" {...base} />
      <path d="M16 19.6 C 18.4 17.4, 20.6 17.6, 22.6 19.6 C 24.6 21.6, 26.8 21.6, 29 19.6 C 30.6 18.2, 32 18.4, 33 19.4" {...base} />
    </svg>
  )
}

/** A checkbox with the tick already in it: nothing happens before someone confirms. */
export function PenCheckbox({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('size-12', className)} {...props}>
      <path d="M9.5 9.8 C 19 9.2, 28.6 9.3, 38.4 9.9 C 38.9 19.4, 38.7 28.8, 38.2 38.4 C 28.8 38.9, 19.2 38.8, 9.7 38.2 C 9.2 28.8, 9.3 19.2, 9.5 9.8 Z" {...base} />
      <path d="M15.5 25 C 18.6 27.4, 20.6 29.6, 22 32 C 25.6 25.4, 30.2 19.4, 36.5 13.6" {...base} />
    </svg>
  )
}

/** A switch drawn in the margin, the knob to the "off" side: parents can stop everything. */
export function PenToggle({ className, ...props }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('size-12', className)} {...props}>
      <path d="M15.5 15.5 C 22 15.2, 28 15.3, 33 15.5 C 38.6 15.6, 41.8 19.4, 41.6 24.2 C 41.4 29, 38.2 32.6, 32.8 32.6 C 27 32.6, 21 32.6, 15.2 32.4 C 9.6 32.2, 6.4 28.6, 6.6 23.8 C 6.8 19.2, 10 15.7, 15.5 15.5 Z" {...base} />
      <path d="M15.6 18.6 C 19 18.4, 21.2 20.6, 21.3 24 C 21.4 27.4, 19 29.6, 15.6 29.6 C 12.4 29.6, 10 27.4, 10 24 C 10 20.8, 12.4 18.8, 15.6 18.6 Z" {...base} />
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
