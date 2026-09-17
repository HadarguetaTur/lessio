'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Search, RefreshCw, Ban, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiscoveryCandidate, DiscoveryAutomation } from '@/lib/outbound/discovery'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type Action = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>
function ready(c: DiscoveryCandidate) {
  return c.review_status === 'ready_for_review' && c.quality_score >= 70 && c.email && c.email_source_url &&
    c.research_facts.length >= 2 && c.personal_line && c.opener_status === 'generated' &&
    !c.research_requested_at && !c.research_claimed_at && !c.rejection_reason
}
/** Anything not yet in the send queue is the operator's to reject, delete or correct. */
function editable(c: DiscoveryCandidate) {
  return c.review_status !== 'approved'
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
/** One button that posts a list of ids: "not relevant" or "delete", single row or the selection. */
function IdsButton({ ids, action, label, doneKey, confirm, icon, variant = 'outline', onDone }: {
  ids: string[]; action: Action; label: string; doneKey: 'rejected' | 'deleted'; confirm?: string
  icon: React.ReactNode; variant?: 'outline' | 'ghost' | 'destructive'; onDone?: () => void
}) {
  const t = useTranslations('admin.outbound.discovery')
  const [state, submit, pending] = useActionState(action, null)
  useEffect(() => { if (state?.ok) onDone?.() }, [state, onDone])
  return <form action={submit} className="flex items-center gap-2"
    onSubmit={(event) => { if (confirm && !window.confirm(confirm)) event.preventDefault() }}>
    <input type="hidden" name="candidateIds" value={JSON.stringify(ids.slice(0, 50))} />
    <Button type="submit" variant={variant} size="sm" disabled={pending || !ids.length}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}{label}
    </Button>
    {state?.ok && <span role="status" className="text-xs">{t(doneKey, { count: Number(state.detail ?? 0) })}</span>}
    {state?.error && <span role="alert" className="text-xs text-destructive">{t('actionFailed')}</span>}
  </form>
}
function EditForm({ candidate, action, onClose }: { candidate: DiscoveryCandidate; action: Action; onClose: () => void }) {
  const t = useTranslations('admin.outbound.discovery')
  const [state, submit, pending] = useActionState(action, null)
  useEffect(() => { if (state?.ok) onClose() }, [state, onClose])
  return <form action={submit} className="space-y-2 rounded-md border p-3">
    <input type="hidden" name="id" value={candidate.id} />
    <label className="block text-xs">{t('editName')}
      <input name="businessName" defaultValue={candidate.business_name} required minLength={2} maxLength={200}
        className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
    </label>
    <label className="block text-xs">{t('editEmail')}
      <input name="email" type="email" dir="ltr" defaultValue={candidate.email ?? ''}
        className="mt-1 w-full rounded-md border bg-background p-2 text-sm" />
    </label>
    <p className="text-xs text-muted-foreground">{t('editHint')}</p>
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm" disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : null}{t('editSave')}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('editCancel')}</Button>
      {state?.error && <span role="alert" className="text-xs text-destructive">{t(state.error === 'DUPLICATE_EMAIL' ? 'editDuplicate' : 'editFailed')}</span>}
    </div>
  </form>
}

export function OutboundCandidateReview({
  candidates, held, discoverAction, approveAction, researchAction, automationAction, rejectAction, deleteAction, updateAction, automation, campaigns,
}: {
  candidates: DiscoveryCandidate[]; held: DiscoveryCandidate[]; discoverAction: Action; approveAction: Action
  researchAction: Action; automationAction: Action; rejectAction: Action; deleteAction: Action; updateAction: Action
  automation: DiscoveryAutomation; campaigns: { id: string; name: string }[]
}) {
  const t = useTranslations('admin.outbound.discovery')
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [discoverState, discover, discovering] = useActionState(discoverAction, null)
  const [approveState, approve, approving] = useActionState(approveAction, null)
  const [automationState, saveAutomation, savingAutomation] = useActionState(automationAction, null)
  const retryable = [...candidates, ...held].filter((c) => ['new', 'ready_for_review'].includes(c.review_status))
  const inResearch = held.filter((c) => c.review_status === 'new' && c.research_requested_at)
  const stopped = held.filter((c) => c.review_status === 'new' && !c.research_requested_at)
  const ruledOut = held.filter((c) => c.review_status !== 'new')
  const visible = candidates
  const selectable = visible.filter(editable)
  const activeSelection = selected.filter((id) => selectable.some((c) => c.id === id))
  const approvable = activeSelection.filter((id) => candidates.some((c) => c.id === id && ready(c))).slice(0, 50)
  const clearSelection = () => setSelected([])

  const row = (c: DiscoveryCandidate) => (
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
                {c.review_status !== 'rejected' && c.team_status !== 'verified' && c.research_completed_at && <p className="text-xs text-amber-700">{t('team.' + c.team_status)}</p>}
                {c.team_status === 'verified' && <p className="text-xs text-emerald-700">{t('team.verified')}</p>}
                {c.personal_line && <p className="rounded-md bg-muted px-3 py-2 text-sm">{c.personal_line}</p>}
                {c.review_status === 'approved' && <p className="text-xs text-emerald-700">{t('promoted', { mode: t(c.approval_mode === 'automatic' ? 'automatic' : 'manual') })}</p>}
                {c.review_status === 'duplicate' && <p className="text-xs">{t('duplicate')}</p>}
                {c.research_requested_at && <p className="text-xs">{t(c.research_claimed_at ? 'researchRunning' : 'researchPending')} · {t('attempt', { count: c.research_attempts })}</p>}
                {c.research_claimed_at && c.research_attempts >= 3 && <p className="text-xs text-amber-700">{t('researchStuck')}</p>}
                {c.rejection_reason && <p className="text-xs text-amber-700">{t.has('reasons.' + c.rejection_reason) ? t('reasons.' + c.rejection_reason) : c.rejection_reason}</p>}
                {c.opener_error && <p className="text-xs text-destructive">{t.has('reasons.' + c.opener_error) ? t('reasons.' + c.opener_error) : c.opener_error} <span dir="ltr">({c.opener_error})</span></p>}
                {editing === c.id ? <EditForm candidate={c} action={updateAction} onClose={() => setEditing(null)} /> : editable(c) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {retryable.some((item) => item.id === c.id) && <ResearchButton ids={[c.id]} action={researchAction}>{t('researchOne')}</ResearchButton>}
                    {retryable.some((item) => item.id === c.id) && <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(c.id)}><Pencil size={14} />{t('edit')}</Button>}
                    {c.review_status !== 'rejected' && <IdsButton ids={[c.id]} action={rejectAction} doneKey="rejected" icon={<Ban size={14} />} label={t('reject')} variant="ghost" />}
                    <IdsButton ids={[c.id]} action={deleteAction} doneKey="deleted" icon={<Trash2 size={14} />} label={t('delete')} variant="ghost" confirm={t('deleteConfirm')} />
                  </div>
                )}
              </div>
  )
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
        <p className="text-sm">{t('all', { count: candidates.length })}</p>
        <ResearchButton ids={retryable.slice(0, 50).map((c) => c.id)} action={researchAction}>{t('researchMany')}</ResearchButton>
      </div>
      {selectable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeSelection.length > 0 && activeSelection.length === selectable.length}
              onChange={(event) => setSelected(event.target.checked ? selectable.map((c) => c.id) : [])} />
            {t('selectAllVisible', { count: selectable.length })}
          </label>
          <form action={approve} className="flex items-center gap-2">
            <input type="hidden" name="candidateIds" value={JSON.stringify(approvable)} />
            <Button type="submit" size="sm" disabled={!approvable.length || approving}>
              {approving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{t('approve', { count: approvable.length })}
            </Button>
            {approveState?.error && <span role="alert" className="text-xs text-destructive">{t('approveFailed')}</span>}
            {approveState?.ok && <span role="status" className="text-xs">{t('approvedCount', { count: Number(approveState.detail ?? 0) })}</span>}
          </form>
          <IdsButton ids={activeSelection} action={rejectAction} doneKey="rejected" icon={<Ban size={14} />}
            label={t('rejectMany', { count: activeSelection.length })} onDone={clearSelection} />
          <IdsButton ids={activeSelection} action={deleteAction} doneKey="deleted" icon={<Trash2 size={14} />} variant="ghost"
            label={t('deleteMany', { count: activeSelection.length })} confirm={t('deleteConfirm')} onDone={clearSelection} />
        </div>
      )}
      {!visible.length ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : (
        <ul className="divide-y divide-border">
          {visible.map((c) => (
            <li key={c.id} className="flex gap-3 py-4">
              <input aria-label={t('select', { name: c.business_name })} type="checkbox" className="mt-1 self-start"
                disabled={!editable(c)} checked={activeSelection.includes(c.id)} onChange={() => toggle(c.id)} />
              {row(c)}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">{t('pipeline', { research: inResearch.length, stopped: stopped.length, ruledOut: ruledOut.length })}</p>
        <p className="text-xs text-muted-foreground">{t('pipelineHint')}</p>
        {([['heldResearch', inResearch], ['heldStopped', stopped], ['heldRuledOut', ruledOut]] as const).map(([key, rows]) => rows.length > 0 && (
          <details key={key} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm">{t(key, { count: rows.length })}</summary>
            <ul className="mt-2 divide-y divide-border">
              {rows.map((c) => <li key={c.id} className="flex gap-3 py-4">{row(c)}</li>)}
            </ul>
          </details>
        ))}
      </div>
    </section>
  )
}
