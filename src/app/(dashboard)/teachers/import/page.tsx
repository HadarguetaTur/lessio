import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function TeachersImportPage() {
  const t = await getTranslations()
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') {
    return <p>{t('common.errors.noPermission')}</p>
  }

  return (
    <div>
      <PageHeader
        title={t('teachers.importPage.title')}
        subtitle={t('teachers.importPage.subtitle')}
        actions={
          <Link href="/teachers">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              {t('teachers.importPage.back')}
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <ImportFlow entityType="teachers" />
      </div>
    </div>
  )
}
