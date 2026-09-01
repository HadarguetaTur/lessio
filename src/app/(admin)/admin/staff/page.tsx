import { getLocale, getTranslations } from 'next-intl/server'
import { DateTime } from 'luxon'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { ASSIGNABLE_ROLES, listStaff } from '@/lib/superadmin/staff'
import { PageHeader } from '@/components/ui/page-header'
import { AdminTable, type AdminTableRow } from '@/components/admin/AdminTable'
import { InviteStaffButton, StaffRowActions } from '@/components/admin/StaffControls'
import {
  changeStaffRoleAction,
  inviteStaffAction,
  setStaffActiveAction,
} from './actions'
import { cn } from '@/lib/utils'

/**
 * Who works on the platform, and what each of them can do.
 *
 * Per /docs/sprint-34-scope.md § B. Nothing created a platform user before
 * this: the production superadmin was inserted by hand, and every invite flow
 * in the codebase hardcodes `owner` or `teacher`.
 */
export default async function AdminStaffPage() {
  const session = await requirePlatformSession('staff.manage')
  const t = await getTranslations('admin.staff')
  const tTable = await getTranslations('admin.table')
  const locale = await getLocale()

  const staff = await listStaff()

  const rows: AdminTableRow[] = staff.map((member) => ({
    id: member.profileId,
    cells: {
      name: (
        <span className={cn('font-medium', !member.isActive && 'text-muted-foreground')}>
          {member.fullName}
          {member.profileId === session.profileId && (
            <span className="ms-1.5 text-xs font-normal text-muted-foreground">
              {t('you')}
            </span>
          )}
        </span>
      ),
      role: t(`roles.${member.role}`),
      status: member.isActive ? (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          {t('active')}
        </span>
      ) : (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {t('inactive')}
        </span>
      ),
      capabilities: (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('capabilityCount', { count: member.capabilities.length })}
        </span>
      ),
      invitedBy: member.invitedByName,
      joined: DateTime.fromISO(member.createdAt).setLocale(locale).toFormat('dd LLL yy'),
      actions: (
        <StaffRowActions
          profileId={member.profileId}
          role={member.role}
          isActive={member.isActive}
          isSelf={member.profileId === session.profileId}
          roles={ASSIGNABLE_ROLES}
          changeRoleAction={changeStaffRoleAction}
          setActiveAction={setStaffActiveAction}
        />
      ),
    },
    sortValues: {
      name: member.fullName,
      role: member.role,
      status: member.isActive ? 1 : 0,
      joined: member.createdAt,
    },
    csv: {
      name: member.fullName,
      role: member.role,
      status: member.isActive ? 'active' : 'inactive',
      invitedBy: member.invitedByName ?? '',
      joined: member.createdAt,
    },
  }))

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('title')}
        subtitle={t('description')}
        actions={<InviteStaffButton roles={ASSIGNABLE_ROLES} action={inviteStaffAction} />}
      />

      <AdminTable
        exportName="lessio-staff"
        emptyLabel={tTable('empty')}
        columns={[
          { key: 'name', label: t('columns.name'), sortable: true },
          { key: 'role', label: t('columns.role'), sortable: true },
          { key: 'status', label: t('columns.status'), sortable: true },
          { key: 'capabilities', label: t('columns.capabilities'), numeric: true, secondary: true },
          { key: 'invitedBy', label: t('columns.invitedBy'), secondary: true },
          { key: 'joined', label: t('columns.joined'), numeric: true, sortable: true },
          { key: 'actions', label: '', align: 'end' },
        ]}
        rows={rows}
      />
    </div>
  )
}
