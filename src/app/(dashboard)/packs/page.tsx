import Link from 'next/link'
import { Ticket } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { listPacks } from '@/lib/billing/packs/manage'
import { getCollectionPolicyServiceRole } from '@/lib/cancellation-policy/service'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { UrlSearchField } from '@/components/dashboard/UrlSearchField'
import { PacksTable } from '@/components/dashboard/packs/PacksTable'
import { commonError } from '@/lib/i18n/actionErrors'
import { matchesSearch } from '@/lib/search/text'
import { adjustPackAction, cancelPackAction, updatePackAction } from './actions'

type Filter = 'active' | 'pending' | 'low' | 'all'

/** Every punch card sold, with what is left on it (decision #46). */
export default async function PacksPage(props: {
  searchParams: Promise<{ status?: string; q?: string; open?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin') {
    return <div className="p-6 text-sm text-muted-foreground">{await commonError('noPermission')}</div>
  }

  const [t, tCommon, allPacks, collection] = await Promise.all([
    getTranslations('packs'),
    getTranslations('common'),
    listPacks(orgId),
    getCollectionPolicyServiceRole(orgId),
  ])

  const filter: Filter = (['active', 'pending', 'low', 'all'] as const).includes(searchParams.status as Filter)
    ? (searchParams.status as Filter)
    : 'active'
  const search = searchParams.q?.trim() ?? ''
  const threshold = collection.packLowBalanceThreshold

  const packs = allPacks.filter((pack) => {
    if (filter === 'active' && pack.status !== 'active') return false
    if (filter === 'pending' && pack.status !== 'pending_payment') return false
    if (filter === 'low' && !(pack.status === 'active' && pack.remaining <= threshold)) return false
    return matchesSearch(search, {
      names: [pack.studentName ?? undefined, pack.billingStudentName ?? undefined, pack.parentName ?? undefined, pack.name],
    })
  })

  const filterHref = (status: Filter) => {
    const params = new URLSearchParams({ status })
    if (search) params.set('q', search)
    return `/packs?${params.toString()}`
  }

  const FILTERS: Array<{ value: Filter; label: string }> = [
    { value: 'active', label: t('filters.active') },
    { value: 'low', label: t('filters.low') },
    { value: 'pending', label: t('filters.pending') },
    { value: 'all', label: tCommon('actions.showAll') },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader title={t('title')} />

      {allPacks.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <UrlSearchField q={search} placeholder={t('searchPlaceholder')} className="me-2 sm:max-w-xs" />
          {FILTERS.map((opt) => (
            <Link
              key={opt.value}
              href={filterHref(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      )}

      {packs.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={search ? tCommon('emptyStates.noResults') : allPacks.length === 0 ? t('empty') : t('emptyFiltered')}
          subtitle={allPacks.length === 0 ? t('emptyHint') : undefined}
          action={
            allPacks.length === 0 ? (
              <Link
                href="/settings/cancellation-policy"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t('emptyCta')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <PacksTable
          packs={packs}
          lowThreshold={threshold}
          isOwner={role === 'owner'}
          openId={searchParams.open ?? null}
          cancelAction={cancelPackAction}
          adjustAction={adjustPackAction}
          updateAction={updatePackAction}
        />
      )}
    </div>
  )
}
