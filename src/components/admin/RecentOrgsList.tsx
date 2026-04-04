import Link from 'next/link'
import { DateTime } from 'luxon'
import type { RecentOrg } from '@/lib/superadmin/dashboard'

interface Props {
  orgs: RecentOrg[]
}

export function RecentOrgsList({ orgs }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">ארגונים פעילים לאחרונה</h2>
      </div>
      {orgs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">אין פעילות עדיין</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {orgs.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{o.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {o.lastActivity
                    ? DateTime.fromISO(o.lastActivity).toRelative({ locale: 'he' })
                    : '—'}
                </p>
              </div>
              <Link
                href={`/admin/orgs/${o.id}`}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                פרטים ←
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
