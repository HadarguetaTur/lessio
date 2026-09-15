import { forbidden } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTeachers } from '@/lib/teachers'
import { getTranslations } from 'next-intl/server'
import { saveCompensationPolicy, saveTeacherEstimateVisibility } from './actions'
import { PolicyForm } from './PolicyForm'

export default async function TeacherEconomicsSettingsPage() {
  const session = await getSession()
  if (session.role !== 'owner') forbidden()
  const [t, teachers, result] = await Promise.all([
    getTranslations('settings.teacherEconomics'),
    getTeachers(session.orgId),
    createServiceRoleClient().from('compensation_policies').select('*').eq('organization_id', session.orgId).order('effective_from', { ascending: false }),
  ])
  const { data: org } = await createServiceRoleClient().from('organizations').select('teacher_estimates_enabled').eq('id', session.orgId).single()
  const policies = result.data ?? []

  return <div className="w-full max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-bold">{t('title')}</h1><p className="text-sm text-muted-foreground">{t('description')}</p></div>
    <form action={saveTeacherEstimateVisibility} className="rounded-lg border bg-card p-5">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={org?.teacher_estimates_enabled === true} />{t('enableTeacherEstimates')}</label>
      <button className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">{t('save')}</button>
    </form>
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('policies')}</h2>
      {policies.map((policy) => <div key={policy.id} className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex justify-between"><strong>{policy.model}</strong><span>{String(policy.effective_from).slice(0, 10)}{policy.effective_to ? ` - ${String(policy.effective_to).slice(0, 10)}` : ''}</span></div>
        <div className="mt-1 text-muted-foreground">{policy.teacher_id ? teachers.find((teacher) => teacher.id === policy.teacher_id)?.profile.full_name ?? t('teacherOverride') : t('organizationDefault')}</div>
      </div>)}
      <PolicyForm
        action={saveCompensationPolicy}
        teachers={teachers.filter((teacher) => teacher.is_active).map((teacher) => ({ id: teacher.id, name: teacher.profile.full_name }))}
        labels={{
          newPolicy: t('newPolicy'), scope: t('scope'), model: t('model'), hourly: t('hourly'), fixed: t('fixed'),
          percentage: t('percentage'), basePlus: t('basePlus'), hourlyAmount: t('hourlyAmount'), fixedAmount: t('fixedAmount'),
          revenuePercent: t('revenuePercent'), participantAmount: t('participantAmount'), noShowPercent: t('noShowPercent'),
          lateCancellationPercent: t('lateCancellationPercent'), effectiveFrom: t('effectiveFrom'), effectiveTo: t('effectiveTo'),
          requiresConfirmation: t('requiresConfirmation'), savePolicy: t('savePolicy'), organizationDefault: t('organizationDefault'),
          required: t('required'), notUsed: t('notUsed'), baseRateType: t('baseRateType'), baseHourly: t('baseHourly'), baseFixed: t('baseFixed'),
        }}
      />
    </div>
  </div>
}
