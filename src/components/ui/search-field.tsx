import * as React from 'react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

type SearchFieldProps = Omit<React.ComponentProps<'input'>, 'type'>

/**
 * A controlled free-text filter box with the magnifier on the reading-end
 * side. Direction-agnostic (logical `end-*` / `pe-*`) so the same markup
 * works under both `dir="rtl"` and `dir="ltr"` dashboards.
 */
function SearchField({ className, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative w-full max-w-sm', className)}>
      <Search
        size={15}
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        autoComplete="off"
        data-slot="search-field"
        className="h-10 w-full rounded-md border border-input bg-background ps-3 pe-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        {...props}
      />
    </div>
  )
}

export { SearchField }
