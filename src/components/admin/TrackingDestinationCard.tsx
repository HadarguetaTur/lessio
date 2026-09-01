'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  ConsentCategory,
  TrackingDestination,
  TrackingProvider,
} from '@/lib/tracking/destinations'
import type { TrackingActionState } from '@/app/(admin)/admin/tracking/actions'

/**
 * One tracking destination, editable.
 *
 * Per /docs/sprint-34-scope.md § C. Server actions arrive as props — shared
 * admin components must never import them (AGENTS.md § Server Action prop rule).
 */

type ActionFn = (
  prev: TrackingActionState | null,
  formData: FormData
) => Promise<TrackingActionState>

const CATEGORIES: ConsentCategory[] = ['necessary', 'analytics', 'marketing']

export function TrackingDestinationCard({
  destination,
  providers,
  serverSideProviders,
  saveAction,
  deleteAction,
}: {
  /** Absent renders the "add a destination" form. */
  destination?: TrackingDestination
  providers: TrackingProvider[]
  serverSideProviders: TrackingProvider[]
  saveAction: ActionFn
  deleteAction: ActionFn
}) {
  const t = useTranslations('admin.tracking')
  const [state, submit, pending] = useActionState(saveAction, null)
  const [, submitDelete] = useActionState(deleteAction, null)

  const isNew = !destination
  const id = destination?.id ?? 'new'
  const takesCredential =
    !destination || serverSideProviders.includes(destination.provider)

  return (
    <form action={submit} className="rounded-xl border border-border bg-card p-5">
      {destination && <input type="hidden" name="id" value={destination.id} />}

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {isNew ? t('addDestination') : destination.label}
        </h2>
        {destination && (
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {destination.provider}
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`provider-${id}`}>{t('provider')}</Label>
          <select
            id={`provider-${id}`}
            name="provider"
            defaultValue={destination?.provider ?? 'meta_pixel'}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {t(`providers.${p}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`label-${id}`}>{t('label')}</Label>
          <Input
            id={`label-${id}`}
            name="label"
            defaultValue={destination?.label ?? ''}
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`externalId-${id}`}>{t('externalId')}</Label>
          <Input
            id={`externalId-${id}`}
            name="externalId"
            defaultValue={destination?.externalId ?? ''}
            dir="ltr"
            required
            minLength={3}
          />
          <p className="text-xs text-muted-foreground">{t('externalIdHint')}</p>
        </div>

        {takesCredential && (
          <div className="space-y-1.5">
            <Label htmlFor={`credential-${id}`}>{t('serverCredential')}</Label>
            <Input
              id={`credential-${id}`}
              name="serverCredential"
              type="password"
              dir="ltr"
              autoComplete="off"
              placeholder={
                destination?.hasServerCredential ? t('credentialSet') : t('credentialEmpty')
              }
            />
            {/* Blank means "leave it alone" — a form that always submitted an
                empty value would wipe the token on every unrelated save. */}
            <p className="text-xs text-muted-foreground">{t('serverCredentialHint')}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`consent-${id}`}>{t('consentCategory')}</Label>
          <select
            id={`consent-${id}`}
            name="consentCategory"
            defaultValue={destination?.consentCategory ?? 'marketing'}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`test-${id}`}>{t('testEventCode')}</Label>
          <Input
            id={`test-${id}`}
            name="testEventCode"
            defaultValue={destination?.testEventCode ?? ''}
            dir="ltr"
            placeholder={t('testEventCodeHint')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isEnabled"
            defaultChecked={destination?.isEnabled ?? false}
            className="size-4 rounded border-input accent-primary"
          />
          {t('isEnabled')}
        </label>

        <div className="flex items-center gap-3">
          {state?.error && (
            <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>
          )}
          {state?.ok && !pending && (
            <p className="flex items-center gap-1 text-sm text-emerald-600">
              <Check size={14} />
              {t('saved')}
            </p>
          )}
          {destination && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const fd = new FormData()
                fd.set('id', destination.id)
                submitDelete(fd)
              }}
            >
              <Trash2 size={14} />
              {t('delete')}
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}
            {isNew ? t('add') : t('save')}
          </Button>
        </div>
      </div>
    </form>
  )
}

export function SendTestEventButton({ action }: { action: ActionFn }) {
  const t = useTranslations('admin.tracking')
  const [state, submit, pending] = useActionState(action, null)

  return (
    <form action={submit} className="flex items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        {t('sendTest')}
      </Button>
      {state?.ok && (
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          {state.message}
        </span>
      )}
    </form>
  )
}
