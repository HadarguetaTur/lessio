import type { ReactNode } from 'react'

import { PenUnderline } from '@/components/marketing/LandingPenMarks'

/**
 * One note page of the diary: a title the pen underlines as it appears, the
 * form written on the ruling, and whatever follows (a divider and a foreign
 * sign-in, a line with the other way in).
 */
export function AuthNotePage({
  title,
  children,
  after,
  footer,
}: {
  title: string
  children: ReactNode
  after?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="note-page">
      <h1 className="display text-[2rem] sm:text-[2.4rem]" data-pen>
        <span className="title-pen">
          {title}
          <PenUnderline />
        </span>
      </h1>
      <div className="mt-8">{children}</div>
      {after ? <div className="mt-8">{after}</div> : null}
      {footer ? <div className="mt-8 text-[color:var(--ink-2)]">{footer}</div> : null}
    </div>
  )
}
