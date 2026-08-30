'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SaasSubscriptionStatus } from '@/lib/saas/types'
import type { SubscriptionActionState } from '@/app/(admin)/admin/subscriptions/actions'

/**
 * The operator controls for one subscription.
 *
 * Per /docs/sprint-34-scope.md § /admin/subscriptions. Server actions arrive as
 * props — shared admin components must never import them directly (AGENTS.md
 * § Server Action prop rule).
 */

export type PlanOption = { id: string; label: string; priceMonthly: number }

type ActionFn = (
  prev: SubscriptionActionState | null,
  formData: FormData
) => Promise<SubscriptionActionState>

interface Props {
  orgId: string
  currentPlanId: string | null
  currentInterval: 'monthly' | 'yearly'
  status: SaasSubscriptionStatus | null
  plans: PlanOption[]
  changePlanAction: ActionFn
  extendTrialAction: ActionFn
  setStatusAction: ActionFn
  cancelAction: ActionFn
}

const MANUAL_STATUSES: SaasSubscriptionStatus[] = [
  'active',
  'past_due',
  'pending_payment',
  'read_only',
  'cancelled',
]

export function SubscriptionActions({
  orgId,
  currentPlanId,
  currentInterval,
  status,
  plans,
  changePlanAction,
  extendTrialAction,
  setStatusAction,
  cancelAction,
}: Props) {
  const t = useTranslations('admin.subscriptions')
  const [planOpen, setPlanOpen] = useState(false)
  const [trialOpen, setTrialOpen] = useState(false)

  const [planState, submitPlan, planPending] = useActionState(changePlanAction, null)
  const [trialState, submitTrial, trialPending] = useActionState(extendTrialAction, null)
  const [, submitStatus] = useActionState(setStatusAction, null)
  const [, submitCancel] = useActionState(cancelAction, null)

  return (
    <div className="flex items-center justify-end gap-1">
      {/* ── change plan ─────────────────────────────────────────────────── */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            {t('changePlan')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form action={submitPlan}>
            <DialogHeader>
              <DialogTitle>{t('changePlan')}</DialogTitle>
              <DialogDescription>{t('changePlanHint')}</DialogDescription>
            </DialogHeader>

            <input type="hidden" name="orgId" value={orgId} />

            <div className="my-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`plan-${orgId}`}>{t('plan')}</Label>
                <select
                  id={`plan-${orgId}`}
                  name="planId"
                  defaultValue={currentPlanId ?? plans[0]?.id}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`interval-${orgId}`}>{t('interval')}</Label>
                <select
                  id={`interval-${orgId}`}
                  name="billingInterval"
                  defaultValue={currentInterval}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="monthly">{t('monthly')}</option>
                  <option value="yearly">{t('yearly')}</option>
                </select>
              </div>

              {planState?.error && (
                <p className="text-sm text-destructive">{planState.error}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={planPending}>
                {planPending && <Loader2 size={14} className="animate-spin" />}
                {t('apply')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── everything else ─────────────────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('moreActions')}>
            <MoreHorizontal size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTrialOpen(true)}>
            {t('extendTrial')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('setStatus')}
          </DropdownMenuLabel>
          {MANUAL_STATUSES.filter((s) => s !== status).map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => {
                const fd = new FormData()
                fd.set('orgId', orgId)
                fd.set('status', s)
                submitStatus(fd)
              }}
            >
              {t(`status.${s}`)}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              const fd = new FormData()
              fd.set('orgId', orgId)
              fd.set('atPeriodEnd', 'true')
              submitCancel(fd)
            }}
          >
            {t('cancelAtPeriodEnd')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── extend trial ────────────────────────────────────────────────── */}
      <Dialog open={trialOpen} onOpenChange={setTrialOpen}>
        <DialogContent>
          <form action={submitTrial}>
            <DialogHeader>
              <DialogTitle>{t('extendTrial')}</DialogTitle>
              <DialogDescription>{t('extendTrialHint')}</DialogDescription>
            </DialogHeader>

            <input type="hidden" name="orgId" value={orgId} />

            <div className="my-4 space-y-1.5">
              <Label htmlFor={`days-${orgId}`}>{t('days')}</Label>
              <Input
                id={`days-${orgId}`}
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={14}
              />
              {trialState?.error && (
                <p className="text-sm text-destructive">{trialState.error}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={trialPending}>
                {trialPending && <Loader2 size={14} className="animate-spin" />}
                {t('apply')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
