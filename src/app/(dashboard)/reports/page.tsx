import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { BarChart2, BookOpen, Receipt, UserRound, GraduationCap } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/**
 * Reports landing page — owner/admin only.
 * Per /docs/sprint-17-scope.md § Story 2.
 */

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const t = await getTranslations('reports')

  const REPORT_CARDS = [
    {
      href: '/reports/revenue',
      icon: BarChart2,
      label: t('revenue.title'),
      desc: t('revenue.description'),
    },
    {
      href: '/reports/lessons',
      icon: BookOpen,
      label: t('lessons.title'),
      desc: t('lessons.description'),
    },
    {
      href: '/reports/debt',
      icon: Receipt,
      label: t('debt.title'),
      desc: t('debt.description'),
    },
    {
      href: '/reports/teachers',
      icon: UserRound,
      label: t('teachers.title'),
      desc: t('teachers.description'),
    },
    {
      href: '/reports/students',
      icon: GraduationCap,
      label: t('students.title'),
      desc: t('students.description'),
    },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-muted-foreground text-sm mb-8">{t('description')}</p>

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
              <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
