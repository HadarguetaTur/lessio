'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ExternalLink, Loader2, Send, Unlink } from 'lucide-react'
import type { StudentGroup } from '@/lib/groups'
import type { WaGroupActionResult } from '@/app/(dashboard)/students/wa-group-actions'

const initial: WaGroupActionResult = { error: null }

/**
 * Linking a student group to a WhatsApp group, inside the group's edit sheet.
 *
 * The honesty here is deliberate. Lessio cannot create a WhatsApp group (Meta
 * gates that behind an Official Business Account), and it cannot read one. What
 * it can do is send each parent the invite privately from the business number,
 * and that is exactly what the card offers and says.
 */
export function WhatsAppGroupCard({
  group,
  linkAction,
  unlinkAction,
  inviteAction,
}: {
  group: StudentGroup
  linkAction: (prev: WaGroupActionResult, formData: FormData) => Promise<WaGroupActionResult>
  unlinkAction: (groupId: string) => Promise<WaGroupActionResult>
  inviteAction: (groupId: string) => Promise<WaGroupActionResult>
}) {
  const t = useTranslations('students.waGroup')
  const router = useRouter()
  // No nested <form>: this card renders inside the group's own form, and a form
  // inside a form is invalid HTML that browsers resolve by dropping one of them.
  const [busy, startBusy] = useTransition()
  const [link, setLink] = useState('')
  const [result, setResult] = useState<WaGroupActionResult | null>(null)

  const linked = group.waGroupMode !== 'none' && Boolean(group.waInviteCode)
  const inviteUrl = group.waInviteCode ? `https://chat.whatsapp.com/${group.waInviteCode}` : null
  const uninvited = Math.max(0, group.studentCount - group.waInvitedCount)

  const run = (fn: () => Promise<WaGroupActionResult>) =>
    startBusy(async () => {
      setResult(await fn())
      router.refresh()
    })

  const submitLink = () => {
    const formData = new FormData()
    formData.set('group_id', group.id)
    formData.set('invite_link', link)
    run(() => linkAction(initial, formData))
  }

  if (!linked) {
    return (
      <section className="rounded-lg border border-dashed p-4">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <ol className="mt-2 mb-3 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>{t('howto.1')}</li>
          <li>{t('howto.2')}</li>
          <li>{t('howto.3')}</li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            dir="ltr"
            placeholder="https://chat.whatsapp.com/…"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={submitLink}
            disabled={busy || link.trim() === ''}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('link')}
          </button>
        </div>
        {result?.error && (
          <p className="mt-2 text-xs text-destructive">{t(`errors.${result.error}`)}</p>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('invitedCount', { invited: group.waInvitedCount, total: group.studentCount })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => run(() => unlinkAction(group.id))}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Unlink size={13} />
          {t('unlink')}
        </button>
      </div>

      {uninvited > 0 && (
        <p className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          {t('pendingInvites', { count: uninvited })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(() => inviteAction(group.id))}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {t('invite')}
        </button>
        {inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ExternalLink size={14} />
            {t('open')}
          </a>
        )}
      </div>

      {result?.error && <p className="text-xs text-destructive">{t(`errors.${result.error}`)}</p>}
      {result && !result.error && result.invited !== undefined && (
        <p className="text-xs text-green-700">{t('inviteSent', { count: result.invited })}</p>
      )}

      <p className="border-t pt-2 text-xs text-muted-foreground">{t('notInGroupNote')}</p>
    </section>
  )
}
