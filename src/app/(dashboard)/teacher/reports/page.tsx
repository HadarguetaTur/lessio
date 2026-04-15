import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart2, GraduationCap } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { getTranslations } from 'next-intl/server'

export default async function TeacherReportsPage() {
  const { role } = await getSession()
  if (role !== 'teacher') redirect('/dashboard')

  const t = await getTranslations('teacherSelf.reports')

  const cards = [
    {
      href: '/teacher/reports/lessons',
      icon: BarChart2,
      title: t('lessonsTitle'),
      desc: t('lessonsDesc'),
    },
    {
      href: '/teacher/reports/students',
      icon: GraduationCap,
      title: t('studentsTitle'),
      desc: t('studentsDesc'),
    },
  ]

  return (
    <div>
      <PageHeader title={t('title')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        {cards.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Icon size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
