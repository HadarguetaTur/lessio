import { getTranslations } from 'next-intl/server'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { listOpenSaasInquiries } from '@/lib/superadmin/saasInquiries'
import { ResolveInquiryButton } from './ResolveInquiryButton'

export default async function AdminSaasInquiriesPage() {
  const t = await getTranslations('admin.saasInquiries')
  const items = await listOpenSaasInquiries()

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
      <AdminHeader title={t('title')} description={t('description')} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-4">{t('empty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start">
                <th className="px-4 py-3 font-medium">{t('org')}</th>
                <th className="px-4 py-3 font-medium">{t('contact')}</th>
                <th className="px-4 py-3 font-medium">{t('phone')}</th>
                <th className="px-4 py-3 font-medium">{t('message')}</th>
                <th className="px-4 py-3 font-medium w-40">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-foreground">{row.organization_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{row.organization_id}</div>
                  </td>
                  <td className="px-4 py-3 align-top">{row.contact_name}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">{row.phone}</td>
                  <td className="px-4 py-3 align-top text-muted-foreground max-w-xs truncate">
                    {row.message ?? '—'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ResolveInquiryButton inquiryId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
