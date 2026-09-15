import { forbidden } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getTeachers } from '@/lib/teachers'
import { getTranslations } from 'next-intl/server'
import { saveCompensationPolicy, saveTeacherEstimateVisibility } from './actions'

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
      <form action={saveCompensationPolicy} className="grid gap-3 rounded-lg border bg-card p-5 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-semibold">{t('newPolicy')}</h2>
        <label>{t('scope')}<select name="teacher_id" className="mt-1 block w-full rounded border p-2"><option value="">{t('organizationDefault')}</option>{teachers.filter((teacher) => teacher.is_active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.profile.full_name}</option>)}</select></label>
        <label>{t('model')}<select name="model" defaultValue="hourly" className="mt-1 block w-full rounded border p-2"><option value="hourly">{t('hourly')}</option><option value="fixed_per_lesson">{t('fixed')}</option><option value="percentage_revenue">{t('percentage')}</option><option value="base_plus_participant">{t('basePlus')}</option></select></label>
        <label>{t('hourlyAmount')}<input name="hourly_amount" type="number" min="0" step="0.01" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('fixedAmount')}<input name="fixed_amount" type="number" min="0" step="0.01" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('revenuePercent')}<input name="revenue_percent" type="number" min="0" max="100" step="0.01" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('participantAmount')}<input name="participant_amount" type="number" min="0" step="0.01" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('noShowPercent')}<input name="no_show_percent" type="number" min="0" max="100" defaultValue="0" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('lateCancellationPercent')}<input name="late_parent_cancellation_percent" type="number" min="0" max="100" defaultValue="0" className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('effectiveFrom')}<input name="effective_from" type="date" required className="mt-1 block w-full rounded border p-2" /></label>
        <label>{t('effectiveTo')}<input name="effective_to" type="date" className="mt-1 block w-full rounded border p-2" /></label>
        <label className="sm:col-span-2 flex items-center gap-2"><input type="checkbox" name="requires_confirmation" />{t('requiresConfirmation')}</label>
        <input type="hidden" name="base_rate_type" value="hourly" />
        <button className="sm:col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">{t('savePolicy')}</button>
      </form>
    </div>
  </div>
}
