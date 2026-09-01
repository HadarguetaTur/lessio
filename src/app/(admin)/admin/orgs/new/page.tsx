import { requirePlatformSession } from '@/lib/superadmin/session'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { NewOrganizationForm } from '@/components/admin/NewOrganizationForm'
import { createOrganizationAction } from '../actions'

/**
 * Create new organization — superadmin only.
 * Per /docs/sprint-18-scope.md § Story 4.
 */
export default async function NewOrganizationPage() {
  await requirePlatformSession('orgs.write')

  const t = await getTranslations('admin')
  const tCommon = await getTranslations('common')
  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-700 mb-4"
      >
        <ArrowRight size={13} />
        {tCommon('actions.back')}
      </Link>
      <PageHeader title={t('orgs.newOrg')} />
      <NewOrganizationForm action={createOrganizationAction} />
    </div>
  )
}
