'use client'

import { useTransition } from 'react'
import { PauseCircle, PlayCircle, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { deleteGroup, toggleGroupStatus, updateGroup } from '@/app/(dashboard)/students/group-actions'
import { EditGroupSheet } from './GroupFormSheet'
import type { StudentGroup } from '@/lib/groups'

interface Student {
  id: string
  full_name: string
}

interface GroupsTableProps {
  groups: StudentGroup[]
  students: Student[]
}

export function GroupsTable({ groups, students }: GroupsTableProps) {
  const t = useTranslations('students')
  const [, startTransition] = useTransition()

  const STATUS_BADGE = {
    active: { label: t('groups.active'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    paused: { label: t('groups.paused'), className: 'bg-amber-50 text-amber-700 border-amber-200' },
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`${t('groups.confirmDelete')} "${name}"?`)) return
    startTransition(async () => {
      await deleteGroup(id)
    })
  }

  const handleToggleStatus = (id: string, status: 'active' | 'paused') => {
    startTransition(async () => {
      await toggleGroupStatus(id, status)
    })
  }

  if (groups.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center py-16 text-center">
        <p className="text-gray-500 text-sm">{t('groups.noGroups')}</p>
        <p className="text-gray-400 text-xs mt-1">{t('groups.noGroupsHint')}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="h-full overflow-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {t('groups.name')}
              </th>
              <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {t('groups.students')}
              </th>
              <th className="sticky top-0 z-10 bg-muted/95 px-5 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                {t('groups.status')}
              </th>
              <th className="sticky top-0 z-10 w-28 bg-muted/95 px-5 py-3 backdrop-blur" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => {
              const badge = STATUS_BADGE[group.status]
              const updateAction = updateGroup.bind(null, group.id)

              return (
                <tr key={group.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-foreground">{group.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div>
                      <span className="text-sm text-muted-foreground">
                        {group.studentCount} {t('groups.count')}
                      </span>
                      {group.studentNames.length > 0 && (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                          {group.studentNames.join(', ')}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <EditGroupSheet
                        students={students}
                        action={updateAction}
                        group={group}
                      />

                      <button
                        onClick={() => handleToggleStatus(group.id, group.status)}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title={group.status === 'active' ? t('groups.pause') : t('groups.resume')}
                      >
                        {group.status === 'active' ? (
                          <PauseCircle size={15} />
                        ) : (
                          <PlayCircle size={15} />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(group.id, group.name)}
                        className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title={t('groups.confirmDelete')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
