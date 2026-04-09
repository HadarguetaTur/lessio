'use client'

import { useState, useEffect, useRef } from 'react'
import { useActionState } from 'react'
import { Plus, Pencil, AlertCircle, Users, Loader2, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { StudentGroup } from '@/lib/groups'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface Student {
  id: string
  full_name: string
}

// ── Design primitives (same as StudentDetailSheet) ────────────────────────────

function SectionCard({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-sm overflow-hidden', className)}>
      {title && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {title}
          </p>
        </div>
      )}
      {children}
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-400',
}
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
}

// ── Inner form ────────────────────────────────────────────────────────────────

function GroupForm({
  students,
  action,
  group,
  onSuccess,
  onCancel,
}: {
  students: Student[]
  action: FormAction
  group?: StudentGroup
  onSuccess: () => void
  onCancel: () => void
}) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const didSubmitRef = useRef(false)
  const [state, formAction, pending] = useActionState(action, null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(group?.studentIds ?? [])
  )
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'active' | 'paused'>(group?.status ?? 'active')

  const STATUS_LABEL: Record<string, string> = {
    active: t('groups.active'),
    paused: t('groups.paused'),
  }

  useEffect(() => {
    if (didSubmitRef.current && !pending && !state?.error) {
      onSuccess()
    }
  }, [state, pending, onSuccess])

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredStudents = search.trim()
    ? students.filter((s) => s.full_name.includes(search.trim()))
    : students

  const selectedCount = selectedIds.size

  return (
    <form
      action={formAction}
      onSubmit={() => { didSubmitRef.current = true }}
      className="flex flex-col h-full"
    >
      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-6 pb-5 border-b border-border bg-muted/20">
        <div className="flex items-start gap-4">
          {/* Group icon avatar */}
          <div className="w-14 h-14 shrink-0 rounded-full bg-blue-100 flex items-center justify-center">
            <Users size={24} className="text-blue-600" />
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-lg font-bold text-foreground leading-tight truncate">
              {group?.name ?? t('groups.newGroup')}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {selectedCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted border border-border text-muted-foreground">
                  {selectedCount} {t('groups.count')}
                </span>
              )}
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                STATUS_BADGE[status]
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[status])} />
                {STATUS_LABEL[status]}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {state?.error && (
          <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-xl">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        {/* Section: Group details */}
        <SectionCard title={t('groups.groupDetails')}>
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">
                {t('groups.name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="group-name"
                name="name"
                required
                defaultValue={group?.name ?? ''}
                placeholder={t('groups.namePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-status">{t('groups.status')}</Label>
              <select
                id="group-status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">{t('groups.active')}</option>
                <option value="paused">{t('groups.paused')}</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* Section: Students */}
        <SectionCard title={`${t('groups.students')}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}>
          {/* Search within the card */}
          <div className="px-4 pt-3 pb-2 border-b border-border/60">
            <div className="relative">
              <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={t('groups.searchStudent')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-input bg-muted/40 pr-8 pl-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Student list */}
          <div className="max-h-64 overflow-y-auto divide-y divide-border/60">
            {filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-1.5 text-center">
                <Users size={24} className="text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t('groups.noStudentsFound')}</p>
              </div>
            ) : (
              filteredStudents.map((s) => {
                const checked = selectedIds.has(s.id)
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                      checked
                        ? 'bg-primary/5 hover:bg-primary/8'
                        : 'hover:bg-muted/40'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(s.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring accent-primary"
                    />
                    <span className={cn(
                      'text-sm',
                      checked ? 'font-medium text-foreground' : 'text-foreground/80'
                    )}>
                      {s.full_name}
                    </span>
                  </label>
                )
              })
            )}
          </div>

          {/* Selected chips */}
          {selectedCount > 0 && (
            <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 flex flex-wrap gap-1.5">
              {Array.from(selectedIds).map((id) => {
                const s = students.find((st) => st.id === id)
                if (!s) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors"
                    onClick={() => toggleStudent(id)}
                    title={tCommon('actions.delete')}
                  >
                    {s.full_name}
                    <span className="opacity-60">×</span>
                  </span>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Hidden inputs carry selected student ids to the server action */}
        {Array.from(selectedIds).map((id) => (
          <input key={id} type="hidden" name="student_ids" value={id} />
        ))}
      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-border bg-background">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending && <Loader2 size={13} className="animate-spin" />}
          {pending ? t('groups.saving') : group ? tCommon('actions.save') : t('groups.createGroup')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </form>
  )
}

// ── New group sheet ────────────────────────────────────────────────────────────

export function NewGroupSheet({
  students,
  action,
}: {
  students: Student[]
  action: FormAction
}) {
  const t = useTranslations('students')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={15} className="ml-1.5" />
        {t('groups.newGroup')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[480px] p-0 flex flex-col gap-0"
          dir="rtl"
        >
          <SheetTitle className="sr-only">{t('groups.newGroup')}</SheetTitle>
          <GroupForm
            students={students}
            action={action}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ── Edit group sheet ───────────────────────────────────────────────────────────

export function EditGroupSheet({
  students,
  action,
  group,
}: {
  students: Student[]
  action: FormAction
  group: StudentGroup
}) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
        title={tCommon('actions.edit')}
      >
        <Pencil size={15} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[480px] p-0 flex flex-col gap-0"
          dir="rtl"
        >
          <SheetTitle className="sr-only">{t('groups.editGroup')} — {group.name}</SheetTitle>
          <GroupForm
            students={students}
            action={action}
            group={group}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
