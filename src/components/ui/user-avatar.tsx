import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

function getColor(name: string): string {
  const index = name.charCodeAt(0) % COLORS.length
  return COLORS[index]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'
}

interface UserAvatarProps {
  name: string
  size?: 'sm' | 'md'
  className?: string
}

export function UserAvatar({ name, size = 'sm', className }: UserAvatarProps) {
  const colorClass = getColor(name)
  const initials = getInitials(name)

  return (
    <Avatar
      className={cn(
        size === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
        className
      )}
    >
      <AvatarFallback
        className={cn(
          'text-[11px] font-bold',
          size === 'md' && 'text-xs',
          colorClass
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
