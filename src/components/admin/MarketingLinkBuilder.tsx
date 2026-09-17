'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Archive, Check, Copy, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AttributionActionState } from '@/app/(admin)/admin/attribution/actions'

/**
 * The short-link builder and its small companions on /admin/attribution.
 *
 * Server actions arrive as props — shared admin components must never import
 * them (AGENTS.md § Server Action prop rule).
 */

type ActionFn = (
  prev: AttributionActionState | null,
  formData: FormData
) => Promise<AttributionActionState>

/**
 * Where the link is going to be posted. Picking a channel is the whole UTM
 * decision — nobody should have to remember whether Facebook groups were
 * "social" or "group" last week, because inconsistent values split one source
 * into two rows of the report.
 */
const CHANNELS = {
  facebookGroup: { source: 'facebook', medium: 'group' },
  facebookPage: { source: 'facebook', medium: 'social' },
  instagram: { source: 'instagram', medium: 'social' },
  whatsapp: { source: 'whatsapp', medium: 'share' },
  email: { source: 'email', medium: 'outreach' },
  other: { source: 'other', medium: 'referral' },
} as const

type Channel = keyof typeof CHANNELS

export function MarketingLinkBuilder({
  createAction,
  targetPaths,
  defaultCampaign,
}: {
  createAction: ActionFn
  targetPaths: readonly string[]
  defaultCampaign: string
}) {
  const t = useTranslations('admin.attribution.builder')
  const [state, submit, pending] = useActionState(createAction, null)
  const [channel, setChannel] = useState<Channel>('facebookGroup')

  return (
    <form action={submit} className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t('description')}</p>

      <input type="hidden" name="utmSource" value={CHANNELS[channel].source} />
      <input type="hidden" name="utmMedium" value={CHANNELS[channel].medium} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="link-label">{t('label')}</Label>
          <Input id="link-label" name="label" required minLength={2} maxLength={80} placeholder={t('labelPlaceholder')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="link-note">{t('note')}</Label>
          <Input id="link-note" name="note" maxLength={200} placeholder={t('notePlaceholder')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="link-channel">{t('channel')}</Label>
          <select
            id="link-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(CHANNELS) as Channel[]).map((c) => (
              <option key={c} value={c}>
                {t(`channels.${c}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="link-target">{t('target')}</Label>
          <select
            id="link-target"
            name="targetPath"
            defaultValue={targetPaths[0]}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {targetPaths.map((path) => (
              <option key={path} value={path}>
                {t(`targets.${path === '/' ? 'home' : path.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="link-slug">{t('slug')}</Label>
          <Input id="link-slug" name="slug" dir="ltr" maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,39}" placeholder="morim-tlv" />
          <p className="text-xs text-muted-foreground">{t('slugHint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="link-campaign">{t('campaign')}</Label>
          <Input id="link-campaign" name="utmCampaign" dir="ltr" maxLength={60} defaultValue={defaultCampaign} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {state?.error && <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>}
        {state?.ok && !pending && (
          <p className="flex items-center gap-1 text-sm text-emerald-600">
            <Check size={14} />
            {t('created')}
            <span className="font-mono text-xs" dir="ltr">/go/{state.slug}</span>
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          {t('create')}
        </Button>
      </div>
    </form>
  )
}

export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard refused (permissions, http): the URL is still on screen.
        }
      }}
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </Button>
  )
}

export function ArchiveLinkButton({
  id,
  action,
  label,
}: {
  id: string
  action: ActionFn
  label: string
}) {
  const [, submit, pending] = useActionState(action, null)

  return (
    <form action={submit}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={label} title={label}>
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
      </Button>
    </form>
  )
}

export function NoTrackToggle({ enabled, action }: { enabled: boolean; action: ActionFn }) {
  const t = useTranslations('admin.attribution.noTrack')
  const [, submit, pending] = useActionState(action, null)

  return (
    <form action={submit} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
      <input type="hidden" name="enable" value={enabled ? '0' : '1'} />
      <p className="min-w-0 flex-1 text-muted-foreground">{enabled ? t('on') : t('off')}</p>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        {enabled ? t('disable') : t('enable')}
      </Button>
    </form>
  )
}
