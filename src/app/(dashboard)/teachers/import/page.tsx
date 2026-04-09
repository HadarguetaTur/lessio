import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default async function TeachersImportPage() {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') {
    return <p>אין הרשאה</p>
  }

  return (
    <div>
      <PageHeader
        title="יבוא מורים"
        subtitle="העלה קובץ אקסל או CSV עם נתוני מורים. כל מורה יקבל הזמנה למערכת."
        actions={
          <Link href="/teachers">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              חזרה למורים
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <ImportFlow entityType="teachers" orgId={orgId} />
      </div>
    </div>
  )
}
