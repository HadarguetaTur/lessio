import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Users, User, GraduationCap } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

interface PageProps {
  searchParams: Promise<{ mode?: string }>
}

export default async function ParentsImportPage({ searchParams }: PageProps) {
  const t = await getTranslations('parents.importPage')
  const tCommon = await getTranslations('common')
  const { role } = await getSession()
  if (role === 'teacher') {
    redirect('/parents')
  }
  if (role !== 'owner' && role !== 'admin') {
    return <p>{tCommon('errors.noPermission')}</p>
  }

  const { mode } = await searchParams

  // Mode: family-list or parents
  if (mode === 'family-list' || mode === 'parents') {
    const entityType = mode === 'family-list' ? 'family-list' : 'parents'
    const title = mode === 'family-list' ? t('familyListTitle') : t('parentsTitle')
    const subtitle =
      mode === 'family-list' ? t('familyListSubtitle') : t('parentsSubtitle')

    return (
      <div>
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <Link href="/parents/import">
              <Button variant="outline" size="sm">
                <ArrowRight size={14} className="ml-1.5" />
                {t('changeMode')}
              </Button>
            </Link>
          }
        />
        <div className="max-w-2xl">
          <ImportFlow entityType={entityType} />
        </div>
      </div>
    )
  }

  // Mode selector
  return (
    <div>
      <PageHeader
        title={t('chooserTitle')}
        subtitle={t('chooserSubtitle')}
        actions={
          <Link href="/parents">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              {t('back')}
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        <Link
          href="/parents/import?mode=family-list"
          className="group rounded-xl border-2 border-primary/20 bg-primary/5 hover:border-primary hover:bg-primary/10 p-5 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
              <Users size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">{t('familyListCard')}</p>
              <span className="text-[10px] font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
                {t('familyListBadge')}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('familyListDesc')}
          </p>
        </Link>

        <Link
          href="/parents/import?mode=parents"
          className="group rounded-xl border-2 border-border hover:border-primary/40 hover:bg-muted/50 p-5 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-muted p-2 group-hover:bg-muted/80 transition-colors">
              <User size={20} className="text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm text-foreground">{t('parentsOnlyCard')}</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('parentsOnlyDesc')}
          </p>
        </Link>

        <Link
          href="/students/import"
          className="group rounded-xl border-2 border-border hover:border-primary/40 hover:bg-muted/50 p-5 transition-colors"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-muted p-2 group-hover:bg-muted/80 transition-colors">
              <GraduationCap size={20} className="text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm text-foreground">{t('studentsOnlyCard')}</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('studentsOnlyDesc')}
          </p>
        </Link>
      </div>
    </div>
  )
}
