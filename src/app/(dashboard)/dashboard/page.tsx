import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { DateTime } from 'luxon'
import { getTranslations, getLocale } from 'next-intl/server'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { LiveRefresh } from '@/lib/realtime/LiveRefresh'
import { getOrgTimezone } from '@/lib/organizations'
import { getEffectiveSaasFeatures } from '@/lib/saas/subscriptions'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { FirstRunWelcome } from '@/components/dashboard/FirstRunWelcome'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { markSetupWelcomeSeen } from './actions'
import {
  AttentionSection,
  MoneySection,
  OutlookSection,
  SetupSection,
  TodaySection,
} from '@/components/dashboard/sections'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function BandSkeleton({ className }: { className?: string }) {
  return <Skeleton className={className ?? 'h-48 w-full rounded-xl'} />
}

export default async function DashboardPage() {
  const { orgId, role } = await getSession()

  if (role === 'teacher') {
    redirect('/teacher/dashboard')
  }

  const [timezone, locale, t, tc, saasFeatures] = await Promise.all([
    getOrgTimezone(orgId),
    getLocale(),
    getTranslations('dashboard'),
    getTranslations('common'),
    getEffectiveSaasFeatures(orgId),
  ])

  const appLocale = parseAppLocale(locale)
  const dt = DateTime.now().setZone(timezone)
  const weekdayKey = WEEKDAY_KEYS[dt.weekday - 1]
  const todayLabel = locale === 'he'
    ? tc('todayLabel', {
        day: tc(`days.${weekdayKey}`),
        dayNum: dt.day,
        month: tc(`months.${dt.month}`),
      })
    : dt.setLocale('en').toFormat('cccc, LLLL d')

  const sectionProps = { orgId, timezone, appLocale, locale }
  const { data: setupOrg } = role === 'owner'
    ? await createServiceRoleClient().from('organizations').select('setup_welcome_seen_at').eq('id', orgId).maybeSingle()
    : { data: null }

  return (
    // Command-centre order: today → what needs a decision → how the business is
    // doing. Every band is a direct child of this column, so they all align to
    // the same container edges. Gaps are the 8px scale (gap-6 = 24px).
    //
    // Each band streams on its own: today's lessons paint as soon as that one
    // query lands instead of waiting for twelve months of revenue aggregation.
    <div className="flex w-full flex-col gap-6">
      {role === 'owner' && (
        <FirstRunWelcome initialSeen={Boolean(setupOrg?.setup_welcome_seen_at)} markSeen={markSetupWelcomeSeen} />
      )}
      <LiveRefresh tables={['lessons', 'charges', 'leads']} />
      <PageHeader
        className="mb-0 gap-3 sm:mb-0"
        title={t('title')}
        subtitle={todayLabel}
        actions={
          <Button asChild size="sm">
            <Link href="/lessons/new">
              <Plus size={14} className="me-1.5" />
              {t('newLesson')}
            </Link>
          </Button>
        }
      />

      {/* 0 — Only when the org is not live yet. Its own boundary with a null
          fallback: the readiness query must never hold up the LCP. */}
      {role === 'owner' && (
        <Suspense fallback={null}>
          <SetupSection orgId={orgId} appLocale={appLocale} />
        </Suspense>
      )}

      {/* 1 — Today, full width. */}
      <Suspense fallback={<BandSkeleton className="h-64 w-full rounded-xl" />}>
        <TodaySection {...sectionProps} />
      </Suspense>

      {/* 2 — Needs attention, as a row of equal-height cards. */}
      <Suspense fallback={<BandSkeleton />}>
        <AttentionSection {...sectionProps} leadsEnabled={saasFeatures.leads} />
      </Suspense>

      {/* 3 — Business performance. */}
      <Suspense fallback={<BandSkeleton className="h-32 w-full rounded-xl" />}>
        <MoneySection {...sectionProps} />
      </Suspense>

      {/* 4 — Forecast beside the 12-month trend. */}
      <Suspense fallback={<BandSkeleton className="h-56 w-full rounded-xl" />}>
        <OutlookSection {...sectionProps} />
      </Suspense>
    </div>
  )
}
