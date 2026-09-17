import { cn } from '@/lib/utils'

/**
 * The L mark: a white "L" on a rounded square with the teal-to-violet
 * gradient. With the LESSIO wordmark it is the one visual commitment carried
 * through every surface (diary, product shell, onboarding, portal, booking),
 * so it is drawn in exactly one place.
 */
export function LessioMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'size-7 rounded-lg text-xs' : size === 'lg' ? 'size-14 rounded-2xl text-xl' : 'size-9 rounded-xl text-sm'
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-teal-500 to-violet-600 font-bold leading-none text-white shadow-sm ring-1 ring-white/15',
        box,
        className
      )}
    >
      L
    </span>
  )
}
