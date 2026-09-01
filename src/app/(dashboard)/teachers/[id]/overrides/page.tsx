import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
import { getTeacherOverrides } from '@/lib/availability-overrides'
import { OverridesEditor } from '@/components/dashboard/availability/OverridesEditor'
import {
  createOverrideAction,
  deleteOverrideAction,
  updateOverrideAction,
} from './actions'
import { getTranslations } from 'next-intl/server'

export default async function TeacherOverridesPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const { orgId, isSupportMode } = await getSession()

  const teacher = await getTeacherById(id, orgId)
  if (!teacher) notFound()

  const overrides = await getTeacherOverrides(id, orgId)
  const t = await getTranslations('teachers')
  const tSelf = await getTranslations('teacherSelf')

  return (
    <div className="flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden pb-8 min-w-0">
      <nav
        className="flex flex-wrap items-center gap-2 mb-6 text-sm text-muted-foreground min-w-0"
        aria-label="Breadcrumb"
      >
        <Link href="/teachers" className="hover:text-foreground shrink-0">
          {t('title')}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <Link
          href={`/teachers/${id}/edit`}
          className="hover:text-foreground font-medium text-foreground truncate max-w-[min(100%,12rem)] sm:max-w-none"
        >
          {teacher.profile.full_name}
        </Link>
        <ArrowRight size={14} className="shrink-0 rotate-180 opacity-60" aria-hidden />
        <span className="text-foreground font-medium">{t('overrides')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-foreground mb-6 break-words">
        {t('overrides')} — {teacher.profile.full_name}
      </h1>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <Link
          href={`/teachers/${id}/availability`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('availability')}
        </Link>
        <span className="text-border" aria-hidden>
          |
        </span>
        <span className="font-medium text-foreground">{t('overrides')}</span>
      </div>

      <p className="text-sm text-muted-foreground mb-6">{tSelf('overridesHint')}</p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <OverridesEditor
          overrides={overrides}
          addAction={createOverrideAction.bind(null, id)}
          updateAction={updateOverrideAction.bind(null, id)}
          deleteAction={deleteOverrideAction.bind(null, id)}
          readOnly={isSupportMode}
        />
      </div>
    </div>
  )
}
