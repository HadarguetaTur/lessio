'use client'

import { Accordion } from 'radix-ui'
import { PenPlus } from '@/components/marketing/LandingPenMarks'

export type LandingFaqItem = {
  question: string
  opening?: string
  rest: readonly string[]
}

/** The questions page: hairline rows, a drawn plus that turns into a minus. */
export function LandingFaqAccordion({
  items,
  dir,
}: {
  items: readonly LandingFaqItem[]
  dir: 'rtl' | 'ltr'
}) {
  return (
    <Accordion.Root type="multiple" className="rule-t mt-8 w-full" dir={dir}>
      {items.map((item, i) => (
        <Accordion.Item key={item.question} value={`faq-${i}`} className="rule-b">
          <Accordion.Header className="flex">
            <Accordion.Trigger className="group flex w-full cursor-pointer items-start gap-4 py-4 text-start">
              <span className="min-w-0 flex-1 text-[1.0625rem] font-semibold leading-snug">{item.question}</span>
              <PenPlus className="mt-1 size-5 shrink-0 text-[color:var(--ink-2)] transition-transform duration-300 ease-out group-data-[state=open]:rotate-45 motion-reduce:transition-none" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
            <div className="max-w-[62ch] space-y-2 pb-5 pe-9">
              {item.opening ? <p className="font-semibold">{item.opening}</p> : null}
              {item.rest.map((para) => (
                <p key={para} className="text-[color:var(--ink-2)]">
                  {para}
                </p>
              ))}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
