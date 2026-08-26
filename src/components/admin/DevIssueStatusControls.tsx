'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { DevIssueStatus } from '@/lib/superadmin/devIssues'

const STATUSES: DevIssueStatus[] = ['open', 'investigating', 'fixed', 'wont_fix']

type SetStatusAction = (
  prev: { error: string | null } | null,
  formData: FormData
) => Promise<{ error: string | null }>

export function DevIssueStatusControls({
  issueId,
  current,
  setStatus,
}: {
  issueId: string
  current: DevIssueStatus
  setStatus: SetStatusAction
}) {
  const t = useTranslations('admin.devIssues')
  const [state, formAction, pending] = useActionState(setStatus, null)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="issue_id" value={issueId} />
      <span className="text-xs text-muted-foreground">{t('changeStatus')}</span>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <Button
            key={status}
            type="submit"
            name="status"
            value={status}
            size="sm"
            variant={status === current ? 'default' : 'outline'}
            disabled={pending || status === current}
          >
            {t(`status.${status}`)}
          </Button>
        ))}
      </div>
      {/* Marking fixed messages every linked ticket, so say so before the click. */}
      {current !== 'fixed' ? (
        <p className="text-xs text-muted-foreground">{t('fixedNotice')}</p>
      ) : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  )
}
