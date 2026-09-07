'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, Loader2, Mail, Plus, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MailboxWithUsage } from '@/lib/outbound/mailboxes'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'
import { cn } from '@/lib/utils'

/**
 * The mailbox pool: which Workspace addresses the engine sends from, how
 * many each may send per day, how many they sent today, and a test send
 * that proves delegation works before the first campaign goes out.
 * Server actions arrive as props (AGENTS.md § Server Action prop rule).
 */

type ActionFn = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

export function OutboundMailboxesCard({
  mailboxes,
  serviceAccountConfigured,
  formatDate,
  saveAction,
  testAction,
}: {
  mailboxes: MailboxWithUsage[]
  serviceAccountConfigured: boolean
  /** Pre-rendered "last polled" strings, keyed by mailbox id (server-side formatting). */
  formatDate: Record<string, string>
  saveAction: ActionFn
  testAction: ActionFn
}) {
  const t = useTranslations('admin.outbound.mailboxes')

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Mail size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold">{t('title')}</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>

      {!serviceAccountConfigured && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('notConfigured')}</span>
        </p>
      )}

      <div className="space-y-3">
        {mailboxes.map((box) => (
          <MailboxRow key={box.id} box={box} lastPolled={formatDate[box.id] ?? '—'} saveAction={saveAction} testAction={testAction} />
        ))}
        <MailboxRow saveAction={saveAction} testAction={testAction} />
      </div>
    </section>
  )
}

function MailboxRow({
  box,
  lastPolled,
  saveAction,
  testAction,
}: {
  box?: MailboxWithUsage
  lastPolled?: string
  saveAction: ActionFn
  testAction: ActionFn
}) {
  const t = useTranslations('admin.outbound.mailboxes')
  const tErr = useTranslations('admin.outbound.errors')
  const [saveState, save, saving] = useActionState(saveAction, null)
  const [testState, test, testing] = useActionState(testAction, null)
  const id = box?.id ?? 'new'
  const capped = box ? box.sentToday >= box.daily_cap : false

  return (
    <div className={cn('rounded-lg border border-border p-4', box && !box.is_active && 'opacity-60')}>
      <form action={save} className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-end">
        {box && <input type="hidden" name="id" value={box.id} />}
        <div className="space-y-1.5">
          <Label htmlFor={`mb-email-${id}`}>{t('email')}</Label>
          <Input id={`mb-email-${id}`} name="email" type="email" dir="ltr" required defaultValue={box?.email ?? ''} placeholder="outreach@yourdomain.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mb-name-${id}`}>{t('displayName')}</Label>
          <Input id={`mb-name-${id}`} name="displayName" defaultValue={box?.display_name ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`mb-cap-${id}`}>{t('dailyCap')}</Label>
          <Input id={`mb-cap-${id}`} name="dailyCap" type="number" min={0} max={500} required defaultValue={box?.daily_cap ?? 30} />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={box?.is_active ?? true} className="size-4 rounded border-input accent-primary" />
            {t('active')}
          </label>
          <Button type="submit" size="sm" variant={box ? 'outline' : 'default'} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : box ? <Check size={14} /> : <Plus size={14} />}
            {box ? t('save') : t('add')}
          </Button>
        </div>
        {saveState?.error && <p className="text-sm text-destructive sm:col-span-4">{tErr(saveState.error)}</p>}
      </form>

      {box && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className={cn('tabular-nums', capped && 'font-semibold text-amber-600')}>
              {t('sentToday', { sent: box.sentToday, cap: box.daily_cap })}
            </span>
            <span>{t('lastPolled', { when: lastPolled ?? '—' })}</span>
            {box.last_error && (
              <span className="flex items-center gap-1 text-destructive" title={box.last_error}>
                <AlertTriangle size={12} />
                {t('lastError')}: <span dir="ltr" className="line-clamp-1 max-w-80">{box.last_error}</span>
              </span>
            )}
          </div>

          <form action={test} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="mailboxId" value={box.id} />
            <Input name="to" type="email" dir="ltr" required placeholder={t('testTo')} className="h-8 w-56 text-xs" />
            <Button type="submit" size="sm" variant="ghost" disabled={testing}>
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t('sendTest')}
            </Button>
            {testState?.ok && !testing && (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check size={12} />
                {t('testSent', { to: testState.sentTo ?? '' })}
              </span>
            )}
            {testState?.error && !testing && (
              <span className="text-destructive" title={testState.detail}>
                {tErr(testState.error)}
                {testState.detail && <span dir="ltr"> · {testState.detail}</span>}
              </span>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
