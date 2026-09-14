'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { DeleteOrganizationActionResult } from '@/app/(admin)/admin/orgs/[id]/actions'

interface Props {
  orgId: string
  orgName: string
  orgSlug: string
  /** Rough size of what is about to go, shown so the operator sees the blast radius. */
  counts: { teachers: number; students: number; parents: number; lessons: number; users: number }
  deleteAction: (orgId: string, confirmation: string) => Promise<DeleteOrganizationActionResult>
}

/**
 * The irreversible button of the danger zone. Two gates before anything runs:
 * the dialog, and typing the org's slug exactly. The server re-checks the slug.
 */
export function DeleteOrganizationCard({ orgId, orgName, orgSlug, counts, deleteAction }: Props) {
  const t = useTranslations('admin.orgs.danger')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [isPending, startTransition] = useTransition()

  const matches = confirmation.trim() === orgSlug

  function handleDelete() {
    if (!matches || isPending) return
    startTransition(async () => {
      const result = await deleteAction(orgId, confirmation)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      // Save the pre-delete snapshot the server took. There is no per-tenant
      // restore — whole-database PITR would roll back every other tenant — so
      // this download is the only copy of the tenant that will exist.
      if (result.snapshotJson) {
        const blob = new Blob([result.snapshotJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `org-snapshot-${orgSlug}-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        toast.warning(t('toast.noSnapshot'))
      }

      if (result.storageObjectsFailed > 0) {
        toast.warning(t('toast.storageLeftBehind', { count: result.storageObjectsFailed }))
      }

      if (result.authUsersFailed.length > 0) {
        toast.warning(t('toast.partial', { name: result.orgName, count: result.authUsersFailed.length }))
      } else {
        toast.success(t('toast.done', { name: result.orgName, rows: result.deletedRows }))
      }
      setOpen(false)
      router.replace('/admin/orgs')
    })
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-destructive/30 flex items-center gap-2">
        <TriangleAlert size={15} className="text-destructive shrink-0" />
        <h3 className="text-sm font-semibold text-destructive">{t('title')}</h3>
      </div>

      <div className="px-4 py-4 space-y-3">
        <p className="text-sm text-foreground">{t('description')}</p>

        <ul className="text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1">
          <li>{t('counts.teachers', { count: counts.teachers })}</li>
          <li>{t('counts.students', { count: counts.students })}</li>
          <li>{t('counts.parents', { count: counts.parents })}</li>
          <li>{t('counts.lessons', { count: counts.lessons })}</li>
          <li>{t('counts.users', { count: counts.users })}</li>
        </ul>

        <p className="text-xs text-muted-foreground">{t('hint')}</p>

        <div className="flex justify-end">
          <AlertDialog
            open={open}
            onOpenChange={(next) => {
              if (isPending) return
              setOpen(next)
              if (!next) setConfirmation('')
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 data-icon="inline-start" />
                {t('button')}
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('dialog.title', { name: orgName })}</AlertDialogTitle>
                <AlertDialogDescription>{t('dialog.description')}</AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2">
                <Label htmlFor="delete-org-confirmation" className="text-xs">
                  {t.rich('dialog.typeSlug', {
                    slug: () => <code className="font-mono text-foreground select-all">{orgSlug}</code>,
                  })}
                </Label>
                <Input
                  id="delete-org-confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={orgSlug}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  className="font-mono"
                  disabled={isPending}
                />
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>{t('dialog.cancel')}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={!matches || isPending}
                >
                  <Trash2 data-icon="inline-start" />
                  {isPending ? t('dialog.deleting') : t('dialog.confirm')}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}
