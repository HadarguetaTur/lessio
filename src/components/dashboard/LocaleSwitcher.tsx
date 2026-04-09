'use client'

import type { ComponentProps } from 'react'
import { useTransition } from 'react'
import { Globe } from 'lucide-react'
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
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'English' : 'עברית'

  function handleSubmit(formData: FormData) {
    startTransition(() => saveLocaleAction(formData))
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
        <Globe size={14} />
        {label}
      </Button>
    </form>
  )
}
