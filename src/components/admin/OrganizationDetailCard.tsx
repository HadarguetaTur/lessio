import { DateTime } from 'luxon'
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

function Yn({ value }: { value: boolean }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {value ? 'מחובר' : 'לא מחובר'}
    </span>
  )
}

export function OrganizationDetailCard({ org }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Identity */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">פרטי ארגון</h2>
        <Row label="שם" value={org.name} />
        <Row label="Slug" value={<span className="font-mono text-xs">{org.slug}</span>} />
        <Row label="אזור זמן" value={org.timezone} />
        <Row
          label="נוצר"
          value={DateTime.fromISO(org.createdAt).toFormat('dd/MM/yyyy')}
        />
        <Row
          label="פעילות אחרונה"
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
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">חיבורים</h2>
          <Row label="WhatsApp" value={<Yn value={org.whatsAppConnected} />} />
          <Row label="ספק תשלומים" value={<Yn value={org.paymentConnected} />} />
          <Row label="ספק קבלות" value={<Yn value={org.receiptConnected} />} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">נתונים</h2>
          <Row label="מורים פעילים" value={org.activeTeachers} />
          <Row label="תלמידים פעילים" value={org.activeStudents} />
          <Row label="חיובים פתוחים" value={org.pendingCharges} />
        </div>
      </div>
    </div>
  )
}
