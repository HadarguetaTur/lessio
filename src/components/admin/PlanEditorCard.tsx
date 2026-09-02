'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SaasFeatures } from '@/lib/saas/types'
import type { PlanActionState } from '@/app/(admin)/admin/plans/actions'

/**
 * One editable plan.
 *
 * Per /docs/sprint-34-scope.md § /admin/plans. The action arrives as a prop —
 * shared admin components must not import server actions (AGENTS.md).
 */

export type EditablePlan = {
  id: string
  name: string
  label: string
  priceMonthly: number
  priceYearly: number | null
  studentsQuota: number | null
  lessonsMonthlyQuota: number | null
  teachersQuota: number | null
  isActive: boolean
  features: SaasFeatures
  /** How many orgs are on this plan right now. */
  subscriberCount: number
}

export function PlanEditorCard({
  plan,
  action,
}: {
  plan: EditablePlan
  action: (prev: PlanActionState | null, formData: FormData) => Promise<PlanActionState>
}) {
  const t = useTranslations('admin.plans')
  const [state, submit, pending] = useActionState(action, null)

  const featureKeys = Object.keys(plan.features) as (keyof SaasFeatures)[]

  return (
    <form
      action={submit}
      className="rounded-xl border border-border bg-background p-5"
    >
      <input type="hidden" name="planId" value={plan.id} />

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{plan.label}</h2>
          <p className="font-mono text-xs text-muted-foreground">{plan.name}</p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('subscribers', { count: plan.subscriberCount })}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`pm-${plan.id}`}>{t('priceMonthly')}</Label>
          <Input
            id={`pm-${plan.id}`}
            name="priceMonthly"
            type="number"
            min={0}
            step="0.01"
            defaultValue={plan.priceMonthly}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`py-${plan.id}`}>{t('priceYearly')}</Label>
          <Input
            id={`py-${plan.id}`}
            name="priceYearly"
            type="number"
            min={0}
            step="0.01"
            defaultValue={plan.priceYearly ?? ''}
            placeholder={t('none')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sq-${plan.id}`}>{t('studentsQuota')}</Label>
          <Input
            id={`sq-${plan.id}`}
            name="studentsQuota"
            type="number"
            min={0}
            defaultValue={plan.studentsQuota ?? ''}
            placeholder={t('unlimited')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`lq-${plan.id}`}>{t('lessonsQuota')}</Label>
          <Input
            id={`lq-${plan.id}`}
            name="lessonsMonthlyQuota"
            type="number"
            min={0}
            defaultValue={plan.lessonsMonthlyQuota ?? ''}
            placeholder={t('unlimited')}
          />
        </div>
        {/* The value metric — what the price is actually a function of. */}
        <div className="space-y-1.5">
          <Label htmlFor={`tq-${plan.id}`}>{t('teachersQuota')}</Label>
          <Input
            id={`tq-${plan.id}`}
            name="teachersQuota"
            type="number"
            min={0}
            defaultValue={plan.teachersQuota ?? ''}
            placeholder={t('unlimited')}
          />
        </div>
      </div>

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          {t('features')}
        </legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {featureKeys.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`feature.${key}`}
                defaultChecked={plan.features[key]}
                className="size-4 rounded border-input accent-indigo-600"
              />
              {t(`feature.${key}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={plan.isActive}
            className="size-4 rounded border-input accent-indigo-600"
          />
          {t('isActive')}
        </label>

        <div className="flex items-center gap-3">
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.ok && !pending && (
            <p className="flex items-center gap-1 text-sm text-emerald-600">
              <Check size={14} />
              {t('saved')}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </form>
  )
}
