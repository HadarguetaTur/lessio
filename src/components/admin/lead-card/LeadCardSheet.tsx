'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * The side panel a lead opens in. Open state lives in the URL (`?open=<id>`):
 * the server renders the card's content, this shell only knows how to close,
 * which it does by dropping the param — so Back closes it and refresh keeps it.
 *
 * Width and side are deliberate: the default sheet is 384px and hangs on the
 * physical right, which for a Hebrew screen is the start side. A conversation
 * plus status buttons plus notes needs more room, on the end side.
 */
export function LeadCardSheet({
  open,
  side,
  title,
  description,
  children,
}: {
  open: boolean
  side: 'left' | 'right'
  title: string
  description: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('open')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) close() }}>
      <SheetContent
        side={side}
        className="data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl gap-0 overflow-y-auto p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
