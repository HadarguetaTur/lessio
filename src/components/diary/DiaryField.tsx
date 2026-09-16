import type { InputHTMLAttributes, ReactNode, Ref } from 'react'

import { PenX } from '@/components/marketing/LandingPenMarks'
import { cn } from '@/lib/utils'

/**
 * A field written on the diary's ruling: the label in the pen's hand above
 * the line, the answer in ink on it. An error turns the line red and adds a
 * short note under it. Works in client and server components alike.
 */
export function DiaryField({
  id,
  label,
  labelEnd,
  error,
  className,
  ref,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: ReactNode
  /** Something beside the label at the reading end, like a "forgot?" link. */
  labelEnd?: ReactNode
  error?: string | null
  ref?: Ref<HTMLInputElement>
}) {
  const errorId = `${id}-error`
  return (
    <div className={cn('field', className)}>
      {labelEnd ? (
        <div className="field-head">
          <label htmlFor={id}>{label}</label>
          {labelEnd}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      <input id={id} ref={ref} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? errorId : undefined} {...input} />
      {error ? (
        <p id={errorId} className="field-error">
          <PenX className="size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
