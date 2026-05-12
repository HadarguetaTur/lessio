'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Pencil, Archive, RotateCcw, CalendarDays, MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'
import { TeacherInviteForm } from './TeacherInviteForm'
import { TeacherEditForm } from './TeacherEditForm'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type VoidAction = () => Promise<void>

// ── "Invite Teacher" button + Sheet ─────────────────────────────────────────

interface NewTeacherSheetProps {
  action: FormAction
}

export function NewTeacherSheet({ action }: NewTeacherSheetProps) {
  const t = useTranslations('teachers')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Mail size={15} className="ml-1.5" />
        {t('invite')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('invite')}</SheetTitle>
            <SheetDescription>{t('inviteFullDescription')}</SheetDescription>
          </SheetHeader>
          <TeacherInviteForm
            action={action}
            onCancel={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false)
              router.refresh()
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ── Row actions: DropdownMenu + Edit Sheet ───────────────────────────────────

interface TeacherRowActionsProps {
  teacher: {
    id: string
    profileName: string
    bio?: string | null
    hourly_rate?: number | null
    is_active: boolean
  }
  updateAction: FormAction
  archiveAction: VoidAction
  restoreAction: VoidAction
}

export function TeacherRowActions({
  teacher,
  updateAction,
  archiveAction,
  restoreAction,
}: TeacherRowActionsProps) {
  const t = useTranslations('teachers')
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil size={13} className="ml-2" />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/teachers/${teacher.id}/availability`} className="flex items-center gap-2">
              <CalendarDays size={13} />
              {t('availabilityLink')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/teachers/${teacher.id}/overrides`} className="flex items-center gap-2">
              {t('overridesLink')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {teacher.is_active ? (
            <DropdownMenuItem asChild>
              <form action={archiveAction} className="w-full">
                <button type="submit" className="flex items-center gap-2 w-full text-destructive">
                  <Archive size={13} />
                  {t('archive')}
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <form action={restoreAction} className="w-full">
                <button type="submit" className="flex items-center gap-2 w-full text-emerald-600">
                  <RotateCcw size={13} />
                  {t('restore')}
                </button>
              </form>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
          <SheetHeader className="mb-6">
            <SheetTitle>{t('editTeacher')}</SheetTitle>
            <SheetDescription>{teacher.profileName}</SheetDescription>
          </SheetHeader>
          <TeacherEditForm
            action={updateAction}
            defaultValues={{
              bio: teacher.bio,
              hourly_rate: teacher.hourly_rate,
            }}
            onCancel={() => setEditOpen(false)}
            onSuccess={() => {
              setEditOpen(false)
              router.refresh()
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
