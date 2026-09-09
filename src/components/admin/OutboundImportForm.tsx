'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Campaign } from '@/lib/outbound/types'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type ActionFn = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

/**
 * CSV -> prospects. A campaign is chosen up front because a prospect without
 * one has nothing to be sent. The result summary names the four buckets a row
 * can land in, so "I uploaded 200 and see 140" has an answer on the page.
 */
export function OutboundImportForm({ campaigns, action }: { campaigns: Campaign[]; action: ActionFn }) {
  const t = useTranslations('admin.outbound')
  const [state, submit, pending] = useActionState(action, null)
  const noCampaign = campaigns.length === 0

  return (
    <form action={submit} className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 text-base font-semibold">{t('import.title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('import.description')}</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="import-campaign">{t('import.campaign')}</Label>
          <select
            id="import-campaign"
            name="campaignId"
            required
            disabled={noCampaign}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_active ? '' : ` (${t('campaign.paused')})`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-file">{t('import.file')}</Label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            disabled={noCampaign}
            className="block h-9 w-full rounded-md border border-input bg-background text-sm file:me-3 file:h-full file:border-0 file:bg-muted file:px-3 file:text-sm"
          />
        </div>
      </div>

      <p className="mb-4 text-xs text-muted-foreground" dir="ltr">
        {t('import.columns')}
      </p>

      <label className="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="generateOpeners"
          defaultChecked
          disabled={noCampaign}
          className="mt-0.5 size-4 rounded border-input accent-primary"
        />
        <span>
          {t('import.generateOpeners')}
          <span className="block text-xs text-muted-foreground">{t('import.generateOpenersHint')}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-sm">
          {noCampaign && <span className="text-muted-foreground">{t('import.needCampaign')}</span>}
          {state?.error && <span className="text-destructive">{t(`errors.${state.error}`)}</span>}
          {state?.ok && state.importResult && (
            <span className="text-emerald-700 dark:text-emerald-400">
              {t('import.result', {
                inserted: state.importResult.inserted,
                suppressed: state.importResult.suppressed,
                duplicates: state.importResult.duplicates,
                invalid: state.importResult.invalid,
              })}
              {state.importResult.invalid > 0 && (
                <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                  {state.importResult.invalidRows}
                </span>
              )}
            </span>
          )}
        </div>
        <Button type="submit" disabled={pending || noCampaign}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {t('import.submit')}
        </Button>
      </div>
    </form>
  )
}
