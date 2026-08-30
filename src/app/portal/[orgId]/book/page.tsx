import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PortalBookingFlow } from '@/components/portal/PortalBookingFlow'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

/**
 * Portal booking page — portal-session auth, reuses booking lib.
 * Per /docs/sprint-13-scope.md § Story 8.
 */
export default async function PortalBookPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) redirect(`/portal/${orgId}/login`)

  const t = await getTranslations('booking.flow')

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  return (
    <main className="flex flex-col flex-1 pb-16">
      {/* No tab of its own, so it carries its own way back to the schedule. */}
      <header className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <Link
          href={`/portal/${orgId}/schedule`}
          aria-label={t('back')}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
        </Link>
        <h1 className="font-bold text-gray-900">{t('tagline')}</h1>
      </header>
      <PortalBookingFlow orgId={orgId} timezone={timezone} />
      <PortalTabBar orgId={orgId} active="book" />
    </main>
  )
}
