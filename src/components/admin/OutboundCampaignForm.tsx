'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Campaign } from '@/lib/outbound/types'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

/**
 * One campaign's cold-email copy, editable. Server actions arrive as props
 * (AGENTS.md § Server Action prop rule).
 */

const PLACEHOLDERS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{personal_line}}', '{{subject_area}}', '{{metadata.<column>}}']

type ActionFn = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

export function OutboundCampaignForm({
  campaign,
  action,
}: {
  /** Absent renders the "new campaign" form. */
  campaign?: Campaign
  action: ActionFn
}) {
  const t = useTranslations('admin.outbound')
  const [state, submit, pending] = useActionState(action, null)
  const id = campaign?.id ?? 'new'

  return (
    <form action={submit} className="rounded-xl border border-border bg-card p-5">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{campaign ? campaign.name : t('campaign.add')}</h2>
        {campaign && (
          <span className="text-xs text-muted-foreground">
            {campaign.is_active ? t('campaign.active') : t('campaign.paused')}
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${id}`}>{t('campaign.name')}</Label>
          <Input id={`name-${id}`} name="name" defaultValue={campaign?.name ?? ''} required minLength={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`locale-${id}`}>{t('campaign.locale')}</Label>
          <select
            id={`locale-${id}`}
            name="locale"
            defaultValue={campaign?.locale ?? 'he'}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="he">עברית</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`subject-${id}`}>{t('campaign.subject')}</Label>
          <Input id={`subject-${id}`} name="subject" defaultValue={campaign?.subject ?? ''} required minLength={2} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`body-${id}`}>{t('campaign.body')}</Label>
          <Textarea
            id={`body-${id}`}
            name="bodyText"
            defaultValue={campaign?.body_text ?? ''}
            required
            minLength={10}
            rows={10}
          />
          <p className="text-xs text-muted-foreground">
            {t('campaign.placeholders')}:{' '}
            <code dir="ltr">{PLACEHOLDERS.join(' ')}</code>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={campaign?.is_active ?? true}
            className="size-4 rounded border-input accent-primary"
          />
          {t('campaign.isActive')}
        </label>

        <div className="flex items-center gap-3">
          {state?.error && <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>}
          {state?.ok && !pending && (
            <p className="flex items-center gap-1 text-sm text-emerald-600">
              <Check size={14} />
              {t('saved')}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}
            {campaign ? t('save') : t('campaign.add')}
          </Button>
        </div>
      </div>
    </form>
  )
}
