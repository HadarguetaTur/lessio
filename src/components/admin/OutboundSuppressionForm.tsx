'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Ban, Check, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type ActionFn = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

/** Add one address to the global do-not-email list. */
export function OutboundSuppressionForm({ action }: { action: ActionFn }) {
  const t = useTranslations('admin.outbound')
  const [state, submit, pending] = useActionState(action, null)

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1 space-y-1.5">
        <label htmlFor="suppress-email" className="text-sm font-medium">
          {t('suppression.email')}
        </label>
        <Input id="suppress-email" name="email" type="email" dir="ltr" required placeholder="name@example.com" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
        {t('suppression.add')}
      </Button>
      {state?.error && <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>}
      {state?.ok && !pending && (
        <p className="flex items-center gap-1 text-sm text-emerald-600">
          <Check size={14} />
          {t('saved')}
        </p>
      )}
    </form>
  )
}
