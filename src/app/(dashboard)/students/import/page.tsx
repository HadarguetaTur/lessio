import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default async function StudentsImportPage() {
  const { orgId, role } = await getSession()
  if (role === 'teacher') {
    redirect('/students')
  }
  if (role !== 'owner' && role !== 'admin') {
    return <p>אין הרשאה</p>
  }

  return (
    <div>
      <PageHeader
        title="יבוא תלמידים"
        subtitle="העלה קובץ אקסל או CSV עם נתוני תלמידים"
        actions={
          <Link href="/students">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              חזרה לתלמידים
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <ImportFlow entityType="students" orgId={orgId} />
      </div>
    </div>
  )
}
