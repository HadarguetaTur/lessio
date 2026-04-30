import { getSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/ui/page-header'
import { ImportFlow } from '@/components/import/ImportFlow'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default async function LessonsImportPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') {
    return <p>אין הרשאה</p>
  }

  return (
    <div>
      <PageHeader
        title="יבוא שיעורים"
        subtitle="העלה קובץ עם מערכת שעות חוזרת או היסטוריית שיעורים"
        actions={
          <Link href="/lessons">
            <Button variant="outline" size="sm">
              <ArrowRight size={14} className="ml-1.5" />
              חזרה לשיעורים
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl space-y-10">
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">מערכת שעות חוזרת</h3>
          <ImportFlow entityType="lessons-schedule" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4">היסטוריית שיעורים</h3>
          <ImportFlow entityType="lessons-history" />
        </div>
      </div>
    </div>
  )
}
