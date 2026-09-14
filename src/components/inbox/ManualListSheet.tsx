'use client'

import { useActionState, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Search, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ListableParent } from '@/lib/broadcast-lists'

type Result = { error: string | null; listId?: string }

/**
 * Create or edit a saved list: a name and a hand-picked set of parents.
 *
 * The picker says, next to each name, anything that would make that parent a
 * wasted member — no phone, or asked to stop — so the owner sees it while
 * choosing rather than in the skipped column of a delivery report a week
 * later. Those parents can still be added: the list is a record of who she
 * means, and the consent rules decide at send time, as they do everywhere.
 */
export function ManualListSheet({
  parents,
  list,
  saveAction,
  deleteAction,
}: {
  parents: ListableParent[]
  /** Absent when creating. */
  list?: { id: string; name: string; memberIds: string[] }
  saveAction: (prev: Result, formData: FormData) => Promise<Result>
  deleteAction?: () => Promise<Result>
}) {
  const t = useTranslations('inbox.lists')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(list?.memberIds ?? []))
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (prev: Result, fd: FormData) => {
      const result = await saveAction(prev, fd)
      if (!result.error) {
        setOpen(false)
        router.refresh()
      }
      return result
    },
    { error: null }
  )

  const byId = useMemo(() => new Map(parents.map((p) => [p.id, p])), [parents])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return parents
    return parents.filter((p) =>
      [p.name, p.phone ?? '', ...p.studentNames].join(' ').toLowerCase().includes(needle)
    )
  }, [parents, query])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openSheet() {
    // Re-seed from the saved list each time, so a cancelled edit does not
    // linger the next time the sheet opens.
    setSelected(new Set(list?.memberIds ?? []))
    setQuery('')
    setOpen(true)
  }

  async function confirmAndDelete() {
    if (!deleteAction) return
    setDeleting(true)
    const result = await deleteAction()
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    setConfirmDelete(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {list ? (
        <Button type="button" variant="ghost" size="sm" onClick={openSheet}>
          <Pencil size={14} aria-hidden />
          {t('edit')}
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={openSheet}>
          <Plus size={14} aria-hidden />
          {t('newList')}
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:w-[480px] sm:max-w-none"
        >
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle>{list ? t('editTitle') : t('newTitle')}</SheetTitle>
              <SheetDescription>{t('sheetHint')}</SheetDescription>
            </SheetHeader>

            <div className="space-y-3 border-b border-border p-4">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('nameLabel')}</span>
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={list?.name ?? ''}
                  placeholder={t('namePlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <input type="hidden" name="parentIds" value={JSON.stringify([...selected])} />

              {selected.size > 0 && (
                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {[...selected].map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {byId.get(id)?.name ?? id}
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        aria-label={t('remove', { name: byId.get(id)?.name ?? '' })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ltr:left-2.5 rtl:right-2.5"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchParents')}
                  aria-label={t('searchParents')}
                  className="w-full rounded-md border border-border bg-background py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ltr:pl-8 ltr:pr-3 rtl:pr-8 rtl:pl-3"
                />
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {matches.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">{t('noParents')}</li>
              ) : (
                matches.map((p) => (
                  <li key={p.id} className="border-b border-border last:border-b-0">
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/60">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground" dir="auto">
                          {[p.phone, p.studentNames.join(', ')].filter(Boolean).join(' · ')}
                        </span>
                        {(!p.phone || p.optedOut) && (
                          <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-400">
                            {!p.phone ? t('noPhone') : t('optedOut')}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))
              )}
            </ul>

            {state.error && (
              <p role="alert" className="px-4 pt-3 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border p-4">
              <span className="text-xs text-muted-foreground">
                {t('selectedCount', { count: selected.size })}
              </span>
              <div className="flex items-center gap-2">
                {list && deleteAction && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmDelete(true)
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('delete')}
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? t('saving') : t('save')}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {list && deleteAction && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteConfirmTitle', { name: list.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('deleteConfirmBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <AlertDialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                {t('cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={confirmAndDelete}>
                {t('delete')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
