'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiscoveryCandidate, DiscoveryAutomation } from '@/lib/outbound/discovery'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type Action = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>
function ready(c: DiscoveryCandidate) {
  return c.review_status === 'ready_for_review' && c.quality_score >= 70 && c.email && c.email_source_url &&
    c.research_facts.length >= 2 && c.personal_line && c.opener_status === 'generated' &&
    !c.research_requested_at && !c.research_claimed_at && !c.rejection_reason
}
function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return null
  return <a href={href} target="_blank" rel="noreferrer noopener" className="text-xs underline">{children}</a>
}
function ResearchButton({ ids, action, children }: { ids: string[]; action: Action; children: React.ReactNode }) {
  const t = useTranslations('admin.outbound.discovery')
  const [state, submit, pending] = useActionState(action, null)
  return <form action={submit} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="candidateIds" value={JSON.stringify(ids.slice(0, 50))} />
    <Button type="submit" variant="outline" size="sm" disabled={pending || !ids.length}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{children}
    </Button>
    {state?.ok && <span role="status" className="text-xs">{t('researchQueued', { count: Number(state.detail ?? 0) })}</span>}
    {state?.error && <span role="alert" className="text-xs text-destructive">{t('researchFailed')}</span>}
  </form>
}

export function OutboundCandidateReview({
  candidates, discoverAction, approveAction, researchAction, automationAction, automation, campaigns,
}: {
  candidates: DiscoveryCandidate[]; discoverAction: Action; approveAction: Action
  researchAction: Action; automationAction: Action; automation: DiscoveryAutomation
  campaigns: { id: string; name: string }[]
}) {
  const t = useTranslations('admin.outbound.discovery')
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [discoverState, discover, discovering] = useActionState(discoverAction, null)
  const [approveState, approve, approving] = useActionState(approveAction, null)
  const [automationState, saveAutomation, savingAutomation] = useActionState(automationAction, null)
  const selectable = candidates.filter(ready).slice(0, 50)
  const activeSelection = selected.filter((id) => selectable.some((c) => c.id === id))
  const retryable = candidates.filter((c) => ['new', 'ready_for_review'].includes(c.review_status))
  const visible = candidates.filter((c) => filter === 'all' || (filter === 'ready' ? ready(c) :
    filter === 'approved' ? c.review_status === 'approved' : ['new', 'rejected', 'duplicate'].includes(c.review_status)))

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('criteria')}
            {t('limits')}
          </p>
        </div>
        <form action={discover}>
          <Button type="submit" variant="outline" disabled={discovering}>
            {discovering ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}{t('collect')}
          </Button>
        </form>
      </div>
      <form action={saveAutomation} className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">{t('automationStatus', { status: t(automation.auto_approve ? 'on' : 'off') })}</p>
        <p className="text-xs text-muted-foreground">
          {t('automationDescription')}
          {t('pauseDescription')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input key={String(automation.auto_approve)} type="checkbox" name="autoApprove" defaultChecked={automation.auto_approve} />
            {t('enable')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            {t('campaign')}
            <select key={automation.campaign_id ?? ''} name="campaignId" defaultValue={automation.campaign_id ?? ''} className="max-w-full rounded-md border bg-background p-2">
              <option value="">{t('chooseCampaign')}</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={savingAutomation}>{t('save')}</Button>
        </div>
        {!campaigns.length && <p className="text-xs text-amber-700">{t('campaignRequired')}</p>}
        {automationState?.ok && <p role="status" className="text-xs">{t('saved')}</p>}
        {automationState?.error && <p role="alert" className="text-xs text-destructive">{t('saveFailed')}</p>}
      </form>
      {discoverState?.error && <p role="alert" className="text-xs text-destructive">{t(discoverState.error === 'DAILY_BUDGET_FULL' ? 'budgetFull' : 'collectFailed')}</p>}
      {discoverState?.ok && <p role="status" className="text-xs">{t('collected', { count: Number(discoverState.detail ?? 0) })}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm">{t('show')}{' '}
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-md border bg-background p-2">
            <option value="all">{t('all', { count: candidates.length })}</option><option value="ready">{t('ready')}</option>
            <option value="approved">{t('approved')}</option><option value="blocked">{t('blocked')}</option>
          </select>
        </label>
        <ResearchButton ids={retryable.slice(0, 50).map((c) => c.id)} action={researchAction}>{t('researchMany')}</ResearchButton>
      </div>
      {selectable.length > 0 && (
        <form action={approve} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <input type="hidden" name="candidateIds" value={JSON.stringify(activeSelection)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeSelection.length > 0 && activeSelection.length === selectable.length}
              onChange={(event) => setSelected(event.target.checked ? selectable.map((c) => c.id) : [])} />
            {t('selectAll', { count: selectable.length })}
          </label>
          <Button type="submit" disabled={!activeSelection.length || approving}>
            {approving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{t('approve', { count: activeSelection.length })}
          </Button>
          {approveState?.error && <span role="alert" className="text-xs text-destructive">{t('approveFailed')}</span>}
          {approveState?.ok && <span role="status" className="text-xs">{t('approvedCount', { count: Number(approveState.detail ?? 0) })}</span>}
        </form>
      )}
      {!visible.length ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : (
        <ul className="divide-y divide-border">
          {visible.map((c) => (
            <li key={c.id} className="flex gap-3 py-4">
              <input aria-label={t('select', { name: c.business_name })} type="checkbox" className="mt-1 self-start"
                disabled={!selectable.some((item) => item.id === c.id)} checked={activeSelection.includes(c.id)} onChange={() => toggle(c.id)} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{c.business_name} <span className="text-sm text-muted-foreground">{t('score', { score: c.quality_score })}</span></p>
                  {c.website_url && <SourceLink href={c.website_url}>{t('website')}</SourceLink>}
                </div>
                <p className="text-xs">{c.quality_reasons.map((code) => t.has('quality.' + code) ? t('quality.' + code, { count: c.research_facts.length }) : code).join(' · ')}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span dir="ltr">{c.email ?? t('noEmail')}</span>
                  {c.email_source_url && <SourceLink href={c.email_source_url}>{t('emailSource')}</SourceLink>}
                </div>
                {c.research_facts.length > 0 && <ul className="space-y-1 text-sm">
                  {c.research_facts.map((fact) => <li key={fact.label}>
                    {fact.value}{' '}<SourceLink href={fact.sourceUrl}>{t('source')}</SourceLink>
                    <p className="text-xs text-muted-foreground">{fact.quote}</p>
                  </li>)}
                </ul>}
                {c.personal_line && <p className="rounded-md bg-muted px-3 py-2 text-sm">{c.personal_line}</p>}
                {c.review_status === 'approved' && <p className="text-xs text-emerald-700">{t('promoted', { mode: t(c.approval_mode === 'automatic' ? 'automatic' : 'manual') })}</p>}
                {c.review_status === 'duplicate' && <p className="text-xs">{t('duplicate')}</p>}
                {c.research_requested_at && <p className="text-xs">{t(c.research_claimed_at ? 'researchRunning' : 'researchPending')} · {t('attempt', { count: c.research_attempts })}</p>}
                {c.research_claimed_at && c.research_attempts >= 3 && <p className="text-xs text-amber-700">{t('researchStuck')}</p>}
                {c.rejection_reason && <p className="text-xs text-amber-700">{t.has('reasons.' + c.rejection_reason) ? t('reasons.' + c.rejection_reason) : c.rejection_reason}</p>}
                {c.opener_error && <p className="text-xs text-destructive">{t.has('reasons.' + c.opener_error) ? t('reasons.' + c.opener_error) : c.opener_error} <span dir="ltr">({c.opener_error})</span></p>}
                {retryable.some((item) => item.id === c.id) && <ResearchButton ids={[c.id]} action={researchAction}>{t('researchOne')}</ResearchButton>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
