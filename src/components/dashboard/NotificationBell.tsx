'use client'

/**
 * Notification bell icon with unread badge and slide-out drawer.
 * Sprint 25 Story 4c.
 *
 * Polls unread count every 60 seconds. Full list loaded on drawer open.
 * Server actions passed as props (server action prop rule).
 */

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { InAppNotification } from '@/lib/notifications'

interface Props {
  initialUnreadCount: number
  locale: string
  fetchNotifications: () => Promise<{
    notifications: InAppNotification[]
    unreadCount: number
  }>
  fetchUnreadCount: () => Promise<number>
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NOTIFICATION_ICONS: Record<string, string> = {
  lesson_cancelled: '\u274C',
  payment_received: '\u2705',
  homework_submitted: '\uD83D\uDCDD',
  student_at_risk: '\u26A0\uFE0F',
  new_lead: '\uD83D\uDC64',
  goal_achieved: '\uD83C\uDFC6',
  day_off_requested: '\uD83C\uDFD6\uFE0F',
  day_off_decided: '\uD83D\uDDD3\uFE0F',
}

export function NotificationBell({
  initialUnreadCount,
  locale,
  fetchNotifications,
  fetchUnreadCount,
  markAsRead,
  markAllRead,
}: Props) {
  const t = useTranslations('notifications')
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Poll unread count every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadCount().then(setUnreadCount).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Load full list when drawer opens
  const handleOpen = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (isOpen) {
        fetchNotifications()
          .then(({ notifications: items, unreadCount: count }) => {
            setNotifications(items)
            setUnreadCount(count)
          })
          .catch(() => {})
      }
    },
    [fetchNotifications]
  )

  const handleClick = (n: InAppNotification) => {
    if (!n.read_at) {
      startTransition(async () => {
        await markAsRead(n.id)
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      })
    }
    if (n.action_url) {
      setOpen(false)
      router.push(n.action_url)
    }
  }

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllRead()
      setNotifications((prev) =>
        prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={t('title')}>
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={locale === 'he' ? 'left' : 'right'}
        className="w-[360px] p-0 sm:max-w-[360px]"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">{t('title')}</SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-muted-foreground"
              >
                {t('markAllRead')}
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[calc(100vh-4rem)]">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClick(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleClick(n) }}
                  className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                    n.read_at ? 'opacity-60' : ''
                  }`}
                >
                  <span className="shrink-0 text-lg mt-0.5">
                    {NOTIFICATION_ICONS[n.type] ?? '\uD83D\uDD14'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read_at ? 'font-normal' : 'font-medium'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {formatRelativeTime(n.created_at, t)}
                    </p>
                  </div>
                  {!n.read_at && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

type RelativeT = (key: string, values?: Record<string, string | number>) => string

function formatRelativeTime(isoDate: string, t: RelativeT): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return t('justNow')
  if (diffMin < 60) return t('minutesAgo', { n: diffMin })

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return t('hoursAgo', { n: diffHours })

  const diffDays = Math.floor(diffHours / 24)
  return t('daysAgo', { n: diffDays })
}
