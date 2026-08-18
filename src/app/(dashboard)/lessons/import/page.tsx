import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function LessonsImportPage() {
  const t = await getTranslations()
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') {
    return <p>{t('common.errors.noPermission')}</p>
  }

  return (
    <div>
      <PageHeader
        title={t('lessons.importTitle')}
        subtitle={t('lessons.importSubtitle')}
        actions={
          <Link href="/lessons">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              {t('lessons.backToLessons')}
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl space-y-10">
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">{t('lessons.recurringSchedule')}</h3>
          <ImportFlow entityType="lessons-schedule" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">{t('lessons.lessonHistory')}</h3>
          <ImportFlow entityType="lessons-history" />
        </div>
      </div>
    </div>
  )
}
