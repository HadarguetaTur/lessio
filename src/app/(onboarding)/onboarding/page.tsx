import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { listActiveSaasPlans } from '@/lib/saas/plans'
import { getOpenCustomPlanInquiry } from '@/lib/saas/subscriptions'
import { getTranslations } from 'next-intl/server'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'superadmin') redirect('/login')

  const orgId = profile.organization_id as string

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('name, timezone, billing_mode, onboarding_completed')
    .eq('id', orgId)
    .single()

  if (!org) redirect('/login')

  // Already onboarded — go to dashboard
  if (org.onboarding_completed) redirect('/dashboard')

  const openInquiry = await getOpenCustomPlanInquiry(orgId)
  if (openInquiry) redirect('/onboarding/pending-custom')

  const saasPlans = await listActiveSaasPlans()
  if (saasPlans.length === 0) {
    const t = await getTranslations('onboarding.errors')
    return (
      <div
        className={`mx-auto max-w-lg text-center text-sm text-foreground ${onboardingPanelCard} ${onboardingPanelPadding}`}
      >
        <p className="leading-relaxed text-muted-foreground">{t('saasPlansMissing')}</p>
      </div>
    )
  }

  // Fetch existing teachers for context
  const { data: teachers } = await db
    .from('teachers')
    .select('id, profile:profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)

  const teacherList = (teachers ?? []).map((t) => {
    const profile = t.profile as unknown as { full_name: string } | null
    return {
      id: t.id,
      full_name: profile?.full_name ?? '',
    }
  })

  // Count existing data to determine starting step
  const { count: studentCount } = await db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const { count: parentCount } = await db
    .from('parents')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const { count: lessonCount } = await db
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  return (
    <OnboardingWizard
      orgId={orgId}
      orgName={org.name}
      ownerName={profile.full_name}
      timezone={org.timezone}
      billingMode={org.billing_mode}
      teachers={teacherList}
      saasPlans={saasPlans}
      counts={{
        students: studentCount ?? 0,
        parents: parentCount ?? 0,
        lessons: lessonCount ?? 0,
        teachers: teacherList.length,
      }}
    />
  )
}
