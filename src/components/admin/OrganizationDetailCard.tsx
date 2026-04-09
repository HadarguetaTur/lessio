import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import type { OrgDetail } from '@/lib/superadmin/organizations'

interface Props {
  org: OrgDetail
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  )
}

function Yn({ value, connectedLabel, notConnectedLabel }: { value: boolean; connectedLabel: string; notConnectedLabel: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {value ? connectedLabel : notConnectedLabel}
    </span>
  )
}

export async function OrganizationDetailCard({ org }: Props) {
  const t = await getTranslations('admin')
  const connectedLabel = t('orgs.detail.connected')
  const notConnectedLabel = t('orgs.detail.notConnected')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Identity */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('orgs.detail.orgDetails')}</h2>
        <Row label={t('orgs.table.name')} value={org.name} />
        <Row label="Slug" value={<span className="font-mono text-xs">{org.slug}</span>} />
        <Row label={t('orgs.detail.timezone')} value={org.timezone} />
        <Row
          label={t('orgs.detail.created')}
          value={DateTime.fromISO(org.createdAt).toFormat('dd/MM/yyyy')}
        />
        <Row
          label={t('orgs.detail.lastActivity')}
          value={
            org.lastActivity
              ? DateTime.fromISO(org.lastActivity).toRelative({ locale: 'he' })
              : '—'
          }
        />
      </div>

      {/* Connections + counts */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('orgs.detail.connections')}</h2>
          <Row label="WhatsApp" value={<Yn value={org.whatsAppConnected} connectedLabel={connectedLabel} notConnectedLabel={notConnectedLabel} />} />
          <Row label={t('orgs.detail.paymentProvider')} value={<Yn value={org.paymentConnected} connectedLabel={connectedLabel} notConnectedLabel={notConnectedLabel} />} />
          <Row label={t('orgs.detail.receiptProvider')} value={<Yn value={org.receiptConnected} connectedLabel={connectedLabel} notConnectedLabel={notConnectedLabel} />} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('orgs.detail.data')}</h2>
          <Row label={t('orgs.detail.activeTeachers')} value={org.activeTeachers} />
          <Row label={t('orgs.detail.activeStudents')} value={org.activeStudents} />
          <Row label={t('orgs.detail.pendingCharges')} value={org.pendingCharges} />
        </div>
      </div>
    </div>
  )
}
