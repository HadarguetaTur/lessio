'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { deleteTemplateAction } from './actions'

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  const t = useTranslations('homework')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm(t('deleteTemplateConfirm'))) return
    startTransition(async () => {
      const result = await deleteTemplateAction(templateId)
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      <Trash2 size={12} />
      {isPending ? `${tCommon('actions.delete')}…` : tCommon('actions.delete')}
    </button>
  )
}
