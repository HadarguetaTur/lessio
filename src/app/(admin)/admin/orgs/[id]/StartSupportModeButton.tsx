'use client'

import { useTransition } from 'react'
import { Eye } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { startSupportModeAction } from './actions'

interface Props {
  orgId: string
  orgName: string
}

export function StartSupportModeButton({ orgId, orgName }: Props) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('admin')

  function handleClick() {
    startTransition(async () => {
      await startSupportModeAction(orgId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title={t('orgs.startSupportTitle', { orgName })}
      className="flex items-center gap-2 text-sm border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
    >
      <Eye size={15} />
      {isPending ? t('orgs.connecting') : t('orgs.startSupport')}
    </button>
  )
}
