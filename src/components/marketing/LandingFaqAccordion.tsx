'use client'

import { Accordion } from 'radix-ui'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type LandingFaqItem = {
  question: string
  opening?: string
  rest: readonly string[]
}

export function LandingFaqAccordion({
  items,
  dir,
}: {
  items: readonly LandingFaqItem[]
  dir: 'rtl' | 'ltr'
}) {
  return (
    <Accordion.Root type="multiple" className="mt-8 w-full border-t border-border/60 pt-8" dir={dir}>
      <div className="flex flex-col gap-3 sm:gap-3.5">
        {items.map((item, i) => (
          <Accordion.Item
            key={item.question}
            value={`faq-${i}`}
            className={cn(
              'overflow-hidden rounded-2xl border border-border/70 bg-muted/[0.35] shadow-sm ring-1 ring-black/[0.02] transition-[border-color,box-shadow,background-color] duration-300 dark:bg-muted/15 dark:ring-white/[0.04]',
              'data-[state=open]:border-teal-500/35 data-[state=open]:bg-gradient-to-bl data-[state=open]:from-teal-500/[0.07] data-[state=open]:via-card/90 data-[state=open]:to-violet-500/[0.08] data-[state=open]:shadow-md data-[state=open]:ring-teal-500/15 dark:data-[state=open]:from-teal-500/[0.12] dark:data-[state=open]:via-card/70 dark:data-[state=open]:to-violet-500/[0.1]',
            )}
          >
            <Accordion.Header className="flex">
              <Accordion.Trigger
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-4 text-start outline-none transition-[background-color,box-shadow] sm:gap-4 sm:px-5 sm:py-4',
                  'hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-muted/20',
                  '[&[data-state=open]>svg:last-child]:rotate-180',
                )}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/28 to-violet-500/22 text-xs font-bold text-teal-900 shadow-sm ring-1 ring-teal-600/10 dark:text-teal-100 dark:ring-teal-400/15"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-pretty text-base font-semibold leading-snug text-foreground sm:text-[1.0625rem] sm:leading-snug">
                  {item.question}
                </span>
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none"
                  aria-hidden
                />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content
              className={cn(
                'overflow-hidden text-start text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none',
              )}
            >
              <div className="space-y-2 border-t border-border/45 px-4 pb-4 pt-3 sm:space-y-2.5 sm:px-5 sm:pb-5 sm:pt-4">
                {item.opening ? (
                  <p className="text-pretty font-semibold leading-relaxed text-foreground sm:text-[0.95rem]">
                    {item.opening}
                  </p>
                ) : null}
                {item.rest.map((para) => (
                  <p
                    key={para}
                    className="text-pretty leading-relaxed text-foreground/88 sm:text-[0.95rem]"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </div>
    </Accordion.Root>
  )
}
