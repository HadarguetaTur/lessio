import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getOpenCustomPlanInquiry } from '@/lib/saas/subscriptions'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { onboardingPanelCard, onboardingPanelPadding } from '@/components/onboarding/onboardingVisual'

export default async function PendingCustomPlanPage() {
  const t = await getTranslations('onboarding.pendingCustom')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id || profile.role === 'superadmin') redirect('/login')

  const orgId = profile.organization_id as string
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('onboarding_completed')
    .eq('id', orgId)
    .single()

  if (org?.onboarding_completed) redirect('/dashboard')

  const open = await getOpenCustomPlanInquiry(orgId)
  if (!open) redirect('/onboarding')

  return (
    <div
      className={`mx-auto max-w-lg space-y-4 py-4 text-center sm:py-8 ${onboardingPanelCard} ${onboardingPanelPadding}`}
    >
      <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t('title')}
      </h1>
      <p className="text-muted-foreground">{t('body')}</p>
      <p className="text-sm text-muted-foreground">{t('footer')}</p>
      <Link
        href="/login"
        className="inline-flex text-sm font-semibold text-violet-600 underline-offset-4 hover:underline dark:text-violet-400"
      >
        {t('logoutHint')}
      </Link>
    </div>
  )
}
