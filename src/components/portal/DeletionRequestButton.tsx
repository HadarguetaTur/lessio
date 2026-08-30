'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import type { DeletionRequestState } from '@/app/portal/[orgId]/home/actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  action: (prev: DeletionRequestState) => Promise<DeletionRequestState>
}

export function DeletionRequestButton({ action }: Props) {
  const t = useTranslations('portal.gdpr')
  const [state, formAction, isPending] = useActionState(action, { error: null })

  if (state.success) {
    return (
      <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
        {t('success')}
      </p>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button type="button" className="min-h-11 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-red-700">
          {t('requestDeletion')}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirmBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        {state.error && <p role="alert" className="text-sm text-red-700">{t(state.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium">{t('cancel')}</button>
          </AlertDialogCancel>
          <form action={formAction}>
            <AlertDialogAction asChild>
              <button type="submit" disabled={isPending} className="min-h-11 w-full rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? t('submitting') : t('confirm')}
              </button>
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
