import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import type { AdminAuditEntry } from '@/lib/superadmin/audit'

/**
 * What operators have done to this tenant.
 *
 * Per /docs/sprint-34-scope.md § /admin/audit. Lives on the danger tab because
 * that is where the actions it records are taken — reading the trail and
 * adding to it belong on the same screen.
 */
export async function OrgAuditPanel({ entries }: { entries: AdminAuditEntry[] }) {
  const t = await getTranslations('admin.audit')
  const locale = await getLocale()

  return (
    <section className="rounded-xl border border-border bg-background">
      <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">{t('title')}</h2>

      {entries.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {DateTime.fromISO(e.createdAt).setLocale(locale).toFormat('dd LLL, HH:mm')}
              </span>
              <span className="font-mono text-xs">{e.action}</span>
              <span className="text-muted-foreground">
                {e.actorName ?? t('unknownActor')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
