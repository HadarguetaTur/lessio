import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { NeedsSetupOrg } from '@/lib/superadmin/dashboard'

interface Props {
  orgs: NeedsSetupOrg[]
}

export async function NeedsSetupList({ orgs }: Props) {
  const t = await getTranslations('admin')

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{t('dashboard.needsSetup')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.needsSetupDesc')}</p>
      </div>
      {orgs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t('dashboard.allConfigured')}</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {orgs.map((o) => (
            <li key={o.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{o.name}</p>
                <div className="flex gap-2 mt-0.5">
                  {o.missingWhatsApp && (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{t('orgs.missingWhatsApp')}</span>
                  )}
                  {o.missingPayment && (
                    <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{t('orgs.missingPayment')}</span>
                  )}
                </div>
              </div>
              <Link
                href={`/admin/orgs/${o.id}`}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {t('orgs.details')} ←
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
