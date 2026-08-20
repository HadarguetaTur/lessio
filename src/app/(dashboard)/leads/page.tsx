import { UserPlus } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getLeads, LeadStatus } from '@/lib/leads'
import { LeadStatusSelect } from '@/components/dashboard/leads/LeadStatusSelect'
import { LeadNotesButton } from '@/components/dashboard/leads/LeadNotesButton'
import { updateLeadStatus, saveLeadNotes } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

const validStatuses: LeadStatus[] = ['new', 'contacted', 'converted', 'irrelevant']

export default async function LeadsPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()
  const t = await getTranslations('leads')
  const tCommon = await getTranslations('common')

  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="mt-10 text-center text-sm text-muted-foreground">{t('noPermission')}</div>
    )
  }

  const statusFilter = validStatuses.includes(searchParams.status as LeadStatus)
    ? (searchParams.status as LeadStatus)
    : undefined

  const leads = await getLeads(orgId, { status: statusFilter })

  const STATUS_LABELS: Record<LeadStatus, string> = {
    new: tCommon('leadStatus.new'),
    contacted: tCommon('leadStatus.contacted'),
    converted: tCommon('leadStatus.converted'),
    irrelevant: t('statusIrrelevant'),
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <LiveRefresh tables={['leads']} />
      <PageHeader title={t('title')} />

      {/* Filters */}
      <form method="GET" className="bg-card rounded-xl border border-border p-4 mb-5 flex flex-wrap gap-3 items-end">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border border-input rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('allStatuses')}</option>
          {validStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('filter')}
        </button>
        <a
          href="/leads"
          className="px-4 py-2 text-sm font-medium text-foreground border border-border rounded-md hover:bg-muted transition-colors"
        >
          {t('reset')}
        </a>
      </form>

      {leads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={t('noLeads')}
          subtitle={t('autoCreated')}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="h-full overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tCommon('table.phone')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('firstMessage')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tCommon('table.status')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {tCommon('table.date')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('fields.notes')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('changeStatus')}
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t('convert')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-5 py-3.5 font-mono text-sm font-medium text-foreground" dir="ltr">
                      {lead.phone}
                    </td>
                    <td className="max-w-xs px-5 py-3.5 text-sm text-muted-foreground">
                      <span title={lead.raw_message}>
                        {lead.raw_message.length > 60
                          ? lead.raw_message.slice(0, 60) + '…'
                          : lead.raw_message}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={lead.status} label={STATUS_LABELS[lead.status as LeadStatus]} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-5 py-3.5">
                      <LeadNotesButton
                        leadId={lead.id}
                        initialNotes={lead.notes}
                        action={saveLeadNotes}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <LeadStatusSelect
                        leadId={lead.id}
                        currentStatus={lead.status}
                        action={updateLeadStatus}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      {lead.status !== 'converted' && (
                        <Link
                          href={`/leads/${lead.id}/convert`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {t('convertLink')}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
