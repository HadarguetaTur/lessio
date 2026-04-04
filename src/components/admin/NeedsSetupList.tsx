import Link from 'next/link'
import type { NeedsSetupOrg } from '@/lib/superadmin/dashboard'

interface Props {
  orgs: NeedsSetupOrg[]
}

export function NeedsSetupList({ orgs }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">דורש הגדרה</h2>
        <p className="text-xs text-gray-500 mt-0.5">ארגונים שחסר להם WhatsApp או ספק תשלומים</p>
      </div>
      {orgs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400">כל הארגונים מוגדרים</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {orgs.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{o.name}</p>
                <div className="flex gap-2 mt-0.5">
                  {o.missingWhatsApp && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">חסר WhatsApp</span>
                  )}
                  {o.missingPayment && (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">חסר תשלומים</span>
                  )}
                </div>
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
