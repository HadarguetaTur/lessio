'use client'

import type { ComponentProps } from 'react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2 } from 'lucide-react'
import { saveLocaleAction } from '@/app/(dashboard)/settings/locale/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  currentLocale: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  fullWidth?: boolean
}

export function LocaleSwitcher({
  currentLocale,
  variant = 'outline',
  size = 'sm',
  className,
  fullWidth = false,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'English' : 'עברית'

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await saveLocaleAction(formData)
      // The action revalidates on the server, but every sidebar link has been
      // prefetched into the client Router Cache in the previous language — so
      // without this the next navigation lands on a stale-language page and the
      // app appears to flip back and forth.
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="locale" value={next} />
      <Button
        type="submit"
        variant={variant}
        size={size}
        disabled={isPending}
        className={cn(
          fullWidth && 'w-full justify-start',
          className
        )}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
        {label}
      </Button>
    </form>
  )
}
