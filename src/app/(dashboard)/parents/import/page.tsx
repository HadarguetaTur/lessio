import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default async function ParentsImportPage() {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') {
    return <p>אין הרשאה</p>
  }

  return (
    <div>
      <PageHeader
        title="יבוא הורים"
        subtitle="העלה קובץ אקסל או CSV עם נתוני הורים"
        actions={
          <Link href="/parents">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              חזרה להורים
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <ImportFlow entityType="parents" orgId={orgId} />
      </div>
    </div>
  )
}
