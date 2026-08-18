import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { StudentsImportClient } from './StudentsImportClient'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function StudentsImportPage() {
  const t = await getTranslations()
  const { role } = await getSession()
  if (role === 'teacher') {
    redirect('/students')
  }
  if (role !== 'owner' && role !== 'admin') {
    return <p>{t('common.errors.noPermission')}</p>
  }

  return (
    <div>
      <PageHeader
        title={t('students.importPage.title')}
        subtitle={t('students.importPage.subtitle')}
        actions={
          <Link href="/students">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              {t('students.importPage.back')}
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <StudentsImportClient />
      </div>
    </div>
  )
}
