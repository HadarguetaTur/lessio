'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AdminSidebar, type AdminNavCounts } from '@/components/admin/AdminSidebar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export function AdminMobileNav({
  userName,
  dir,
  counts,
}: {
  userName: string
  dir: 'rtl' | 'ltr'
  counts?: AdminNavCounts
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Radix generates client-only ids. Delaying this isolated mobile control keeps
  // those ids out of the server tree and prevents the entire admin shell from
  // being discarded during hydration.
  if (!mounted) return <span className="size-8" aria-hidden />

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
          <Menu size={16} />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={dir === 'rtl' ? 'right' : 'left'}
        className="w-[280px] p-0 sm:max-w-[280px]"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Admin navigation</SheetTitle>
          <SheetDescription>Platform administration pages</SheetDescription>
        </SheetHeader>
        <AdminSidebar userName={userName} counts={counts} mobile />
      </SheetContent>
    </Sheet>
  )
}
