'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
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
  month: string
  mode: 'publish' | 'reopen'
  action: (formData: FormData) => Promise<void>
}

/**
 * Publishing freezes the month's lines; reopening un-freezes them. Both are
 * behind a confirmation that says what the snapshot is and, just as
 * importantly, what it is not (a salary approval).
 */
export function PublishSnapshotButton({ month, mode, action }: Props) {
  const t = useTranslations('reports.economics.publishDialog')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const formData = new FormData()
    formData.set('month', month)
    startTransition(() => action(formData))
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={mode === 'publish'
            ? 'inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90'
            : 'inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50'}
        >
          {t(`${mode}.trigger`)}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${mode}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${mode}.body`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <button type="button" className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium">{t('cancel')}</button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button type="button" onClick={submit} disabled={pending} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {pending ? t('working') : t(`${mode}.confirm`)}
            </button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
