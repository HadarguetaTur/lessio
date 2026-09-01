'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, MoreHorizontal, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PlatformRole } from '@/lib/superadmin/capabilities'
import type { StaffActionState } from '@/app/(admin)/admin/staff/actions'

/**
 * Invite and manage platform colleagues.
 *
 * Per /docs/sprint-34-scope.md § B. Server actions arrive as props — shared
 * admin components must never import them directly (AGENTS.md § Server Action
 * prop rule).
 */

type ActionFn = (
  prev: StaffActionState | null,
  formData: FormData
) => Promise<StaffActionState>

export function InviteStaffButton({
  roles,
  action,
}: {
  roles: PlatformRole[]
  action: ActionFn
}) {
  const t = useTranslations('admin.staff')
  const [open, setOpen] = useState(false)
  const [state, submit, pending] = useActionState(action, null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus size={15} />
          {t('invite')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{t('invite')}</DialogTitle>
            <DialogDescription>{t('inviteHint')}</DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">{t('fullName')}</Label>
              <Input id="staff-name" name="fullName" required minLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">{t('email')}</Label>
              <Input id="staff-email" name="email" type="email" required dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-role">{t('role')}</Label>
              <select
                id="staff-role"
                name="role"
                defaultValue="platform_viewer"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
              {/* The safest default when a new colleague's remit is unclear. */}
              <p className="text-xs text-muted-foreground">{t('roleHint')}</p>
            </div>
            {state?.error && <p className="text-sm text-destructive">{t(`errors.${state.error}`)}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 size={14} className="animate-spin" />}
              {t('sendInvite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function StaffRowActions({
  profileId,
  role,
  isActive,
  isSelf,
  roles,
  changeRoleAction,
  setActiveAction,
}: {
  profileId: string
  role: PlatformRole
  isActive: boolean
  isSelf: boolean
  roles: PlatformRole[]
  changeRoleAction: ActionFn
  setActiveAction: ActionFn
}) {
  const t = useTranslations('admin.staff')
  const [, submitRole] = useActionState(changeRoleAction, null)
  const [, submitActive] = useActionState(setActiveAction, null)

  // Changing your own role or locking yourself out is never intentional; the
  // library rejects both, and hiding the controls says so before the click.
  if (isSelf || role === 'superadmin') {
    return <span className="text-xs text-muted-foreground">{t('notEditable')}</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('rowActions')}>
          <MoreHorizontal size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('changeRole')}
        </DropdownMenuLabel>
        {roles
          .filter((r) => r !== role)
          .map((r) => (
            <DropdownMenuItem
              key={r}
              onSelect={() => {
                const fd = new FormData()
                fd.set('profileId', profileId)
                fd.set('role', r)
                submitRole(fd)
              }}
            >
              {t(`roles.${r}`)}
            </DropdownMenuItem>
          ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant={isActive ? 'destructive' : 'default'}
          onSelect={() => {
            const fd = new FormData()
            fd.set('profileId', profileId)
            fd.set('isActive', String(!isActive))
            submitActive(fd)
          }}
        >
          {isActive ? t('deactivate') : t('reactivate')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
