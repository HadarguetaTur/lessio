import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { BarChart2, BookOpen, Receipt, UserRound, GraduationCap } from 'lucide-react'

/**
 * Reports landing page — owner/admin only.
 * Per /docs/sprint-17-scope.md § Story 2.
 */

const REPORT_CARDS = [
  {
    href: '/reports/revenue',
    icon: BarChart2,
    label: 'הכנסות',
    desc: 'הכנסות חודשיות ב-12 חודשים האחרונים',
  },
  {
    href: '/reports/lessons',
    icon: BookOpen,
    label: 'שיעורים',
    desc: 'שיעורים שנלמדו לעומת שיעורים שבוטלו',
  },
  {
    href: '/reports/debt',
    icon: Receipt,
    label: 'חובות',
    desc: 'הורים עם חיובים פתוחים',
  },
  {
    href: '/reports/teachers',
    icon: UserRound,
    label: 'מורים',
    desc: 'שיעורים והכנסות לפי מורה',
  },
  {
    href: '/reports/students',
    icon: GraduationCap,
    label: 'תלמידים',
    desc: 'פעילות תלמידים ואיתור תלמידים בסיכון',
  },
]

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">דוחות</h1>
      <p className="text-gray-500 text-sm mb-8">ניתוח נתוני פעילות ארגון</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_CARDS.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all bg-white group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
              <Icon size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{label}</p>
              <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
