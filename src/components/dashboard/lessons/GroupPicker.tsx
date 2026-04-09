'use client'

import { useTranslations } from 'next-intl'
import type { StudentGroup } from '@/lib/groups'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const selectClassName = cn(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground',
  'outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'dark:bg-input/30'
)

interface GroupPickerProps {
  groups: StudentGroup[]
  value: string
  onChange: (groupId: string, studentIds: string[], studentNames: string[]) => void
}

export function GroupPicker({ groups, value, onChange }: GroupPickerProps) {
  const t = useTranslations('lessons')
  const tStudents = useTranslations('students')
  const activeGroups = groups.filter((g) => g.status === 'active')

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const groupId = e.target.value
    const group = activeGroups.find((g) => g.id === groupId)
    onChange(groupId, group?.studentIds ?? [], group?.studentNames ?? [])
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="group_id">
        {t('group')} <span className="text-destructive">*</span>
      </Label>
      <select
        id="group_id"
        value={value}
        onChange={handleChange}
        className={selectClassName}
      >
        <option value="">{t('groupSelectPlaceholder')}</option>
        {activeGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({g.studentCount} {tStudents('groups.count')})
          </option>
        ))}
      </select>

      {value && (() => {
        const group = activeGroups.find((g) => g.id === value)
        if (!group || group.studentNames.length === 0) return null
        return (
          <p className="text-xs text-muted-foreground mt-1">
            {group.studentNames.join(', ')}
          </p>
        )
      })()}

      {activeGroups.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">
          {tStudents('groups.noActiveGroups')}
        </p>
      )}
    </div>
  )
}
