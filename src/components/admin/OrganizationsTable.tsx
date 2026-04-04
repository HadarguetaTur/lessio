import Link from 'next/link'
import { DateTime } from 'luxon'
import type { OrgListItem } from '@/lib/superadmin/organizations'
import { OrganizationStatusBadge } from './OrganizationStatusBadge'

interface Props {
  orgs: OrgListItem[]
}

function Yn({ value }: { value: boolean }) {
  return (
    <span className={value ? 'text-green-600 font-medium' : 'text-gray-400'}>
      {value ? 'כן' : 'לא'}
    </span>
  )
}

export function OrganizationsTable({ orgs }: Props) {
  if (orgs.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">לא נמצאו ארגונים</p>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-right">
            <th className="px-4 py-3 font-medium text-gray-500">שם</th>
            <th className="px-4 py-3 font-medium text-gray-500">Slug</th>
            <th className="px-4 py-3 font-medium text-gray-500">סטטוס</th>
            <th className="px-4 py-3 font-medium text-gray-500">פעילות אחרונה</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center">WhatsApp</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center">תשלומים</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center">קבלות</th>
            <th className="px-4 py-3 font-medium text-gray-500">נוצר</th>
            <th className="px-4 py-3 font-medium text-gray-500">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{o.slug}</td>
              <td className="px-4 py-3"><OrganizationStatusBadge status={o.status} /></td>
              <td className="px-4 py-3 text-gray-500">
                {o.lastActivity
                  ? DateTime.fromISO(o.lastActivity).toRelative({ locale: 'he' })
                  : '—'}
              </td>
              <td className="px-4 py-3 text-center"><Yn value={o.whatsAppConnected} /></td>
              <td className="px-4 py-3 text-center"><Yn value={o.paymentConnected} /></td>
              <td className="px-4 py-3 text-center"><Yn value={o.receiptConnected} /></td>
              <td className="px-4 py-3 text-gray-500">
                {DateTime.fromISO(o.createdAt).toFormat('dd/MM/yy')}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Link
                    href={`/admin/orgs/${o.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    פרטים
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
