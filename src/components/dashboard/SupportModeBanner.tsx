'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldAlert, LogOut } from 'lucide-react'
import { exitSupportModeAction } from '@/app/(admin)/admin/orgs/[id]/actions'

interface Props {
  orgName: string
  expiresAt: string
}

export function SupportModeBanner({ orgName, expiresAt }: Props) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('admin')

  const expires = new Date(expiresAt)
  const minsLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 60_000))

  function handleExit() {
    startTransition(async () => {
      await exitSupportModeAction()
    })
  }

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm" dir="rtl">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} />
        <span>{t('supportBanner', { orgName, timeRemaining: minsLeft })}</span>
        <span className="text-amber-200 text-xs">{t('readOnly')}</span>
      </div>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
      >
        <LogOut size={12} />
        {isPending ? '...' : t('orgs.exitSupport')}
      </button>
    </div>
  )
}
