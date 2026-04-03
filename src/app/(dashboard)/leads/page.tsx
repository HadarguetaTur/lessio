import { UserPlus } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getLeads, LeadStatus } from '@/lib/leads'
import { LeadStatusSelect } from '@/components/dashboard/leads/LeadStatusSelect'
import { LeadNotesButton } from '@/components/dashboard/leads/LeadNotesButton'
import { updateLeadStatus, saveLeadNotes } from './actions'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'חדש',
  contacted: 'נוצר קשר',
  converted: 'הומר',
  irrelevant: 'לא רלוונטי',
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-yellow-50 text-yellow-700',
  contacted: 'bg-blue-50 text-blue-700',
  converted: 'bg-green-50 text-green-700',
  irrelevant: 'bg-gray-100 text-gray-500',
}

const validStatuses: LeadStatus[] = ['new', 'contacted', 'converted', 'irrelevant']

export default async function LeadsPage(props: {
  searchParams: Promise<{ status?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="mt-10 text-center text-sm text-gray-400">אין הרשאה לצפות בדף זה</div>
    )
  }

  const statusFilter = validStatuses.includes(searchParams.status as LeadStatus)
    ? (searchParams.status as LeadStatus)
    : undefined

  const leads = await getLeads(orgId, { status: statusFilter })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">לידים</h1>
      </div>

      {/* Filters */}
      <form method="GET" className="bg-white rounded-lg border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">כל הסטטוסים</option>
          {validStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          סנן
        </button>
        <a
          href="/leads"
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          איפוס
        </a>
      </form>

      {leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 flex flex-col items-center gap-2">
          <UserPlus size={32} className="text-gray-200" />
          <p className="text-sm text-gray-400">לא נמצאו לידים</p>
          <p className="text-xs text-gray-300">לידים נוצרים אוטומטית מהודעות WhatsApp</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  טלפון
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  הודעה ראשונה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  סטטוס
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  תאריך יצירה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  הערות
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  שינוי סטטוס
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  המרה
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900" dir="ltr">
                    {lead.phone}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                    <span title={lead.raw_message}>
                      {lead.raw_message.length > 60
                        ? lead.raw_message.slice(0, 60) + '…'
                        : lead.raw_message}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[lead.status]}`}
                    >
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(lead.created_at).toLocaleDateString('he-IL')}
                  </td>
                  <td className="px-4 py-3">
                    <LeadNotesButton
                      leadId={lead.id}
                      initialNotes={lead.notes}
                      action={saveLeadNotes}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusSelect
                      leadId={lead.id}
                      currentStatus={lead.status}
                      action={updateLeadStatus}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {lead.status !== 'converted' && (
                      <a
                        href={`/leads/${lead.id}/convert`}
                        className="text-sm text-green-700 hover:text-green-900"
                      >
                        המר
                      </a>
                    )}
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
