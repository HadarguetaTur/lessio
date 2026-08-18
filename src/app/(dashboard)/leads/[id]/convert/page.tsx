import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getLeadById } from '@/lib/leads'
import { ConvertLeadForm } from '@/components/dashboard/leads/ConvertLeadForm'
import { getTranslations } from 'next-intl/server'

export default async function ConvertLeadPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    redirect('/leads')
  }

  const lead = await getLeadById(params.id, orgId)
  if (!lead) notFound()

  if (lead.status === 'converted') {
    redirect('/leads')
  }

  const t = await getTranslations('leads')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('convertTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('convertDescription')}
        </p>
      </div>

      {/* Lead summary */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg max-w-md">
        <div className="text-sm text-gray-500 space-y-1">
          <div>
            <span className="font-medium text-gray-700">{t('fields.phone')}: </span>
            <span dir="ltr">{lead.phone}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">{t('leads.firstMessage')}</span>
            {lead.raw_message.length > 80 ? lead.raw_message.slice(0, 80) + '…' : lead.raw_message}
          </div>
          <div>
            <span className="font-medium text-gray-700">{t('leads.createdAt')}</span>
            {new Date(lead.created_at).toLocaleDateString('he-IL')}
          </div>
        </div>
      </div>

      <ConvertLeadForm leadId={lead.id} phone={lead.phone} />
    </div>
  )
}
