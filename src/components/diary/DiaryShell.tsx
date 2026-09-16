import type { ReactNode } from 'react'

import './diary.css'
import { DiaryPen } from '@/components/diary/DiaryPen'
import { diaryFontVars } from '@/components/diary/fonts'
import { cn } from '@/lib/utils'

export const DIARY_SCROLL_ROOT_ID = 'diary-scroll'

/**
 * The diary as a page shell: paper, the three faces, the scroll container
 * (the root <body> is overflow-hidden, so this wrapper scrolls), a skip link,
 * and the one pen observer that draws every `data-pen` element once.
 *
 * Shared by the landing page, the auth pages and the legal pages so a visitor
 * never leaves the diary until they sign in.
 */
export function DiaryShell({
  dir,
  skipTo,
  skipLabel,
  className,
  children,
}: {
  dir: 'rtl' | 'ltr'
  /** The id of the main content the skip link jumps to. */
  skipTo: string
  skipLabel: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      id={DIARY_SCROLL_ROOT_ID}
      className={cn('diary relative flex min-h-dvh flex-col overflow-y-auto overflow-x-hidden', diaryFontVars, className)}
      dir={dir}
    >
      <a
        href={`#${skipTo}`}
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[60] focus:bg-[color:var(--hl)] focus:px-3 focus:py-2"
      >
        {skipLabel}
      </a>
      {children}
      <DiaryPen scrollRootId={DIARY_SCROLL_ROOT_ID} />
    </div>
  )
}
