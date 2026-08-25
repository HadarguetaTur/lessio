'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SearchSelect } from '@/components/ui/search-select'
import { Label } from '@/components/ui/label'

interface Props {
  students: { id: string; full_name: string }[]
  value: string[]
  onChange: (studentIds: string[]) => void
}

/**
 * Picks any number of students for a custom lesson.
 *
 * A custom lesson has no fixed roster size, and the org may not have a
 * pre-defined group for this particular combination — so students are added one
 * at a time instead of through GroupPicker. Each pick emits a hidden
 * `student_ids` input, the same wire format the group path already submits.
 */
export function StudentMultiPicker({ students, value, onChange }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [pending, setPending] = useState('')

  const selected = value
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is { id: string; full_name: string } => Boolean(s))

  const available = students.filter((s) => !value.includes(s.id))

  const handleAdd = (studentId: string) => {
    // Reset the picker straight away so it reads as "add another", not
    // "the last one you added".
    setPending('')
    if (!studentId || value.includes(studentId)) return
    onChange([...value, studentId])
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="custom_student_picker">
        {t('students')} <span className="text-destructive">*</span>
      </Label>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 ps-3 pe-1.5 text-sm"
            >
              <span>{s.full_name}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== s.id))}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                aria-label={`${tCommon('actions.delete')} ${s.full_name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SearchSelect
        id="custom_student_picker"
        name="custom_student_picker"
        value={pending}
        onChange={handleAdd}
        options={available.map((s) => ({ value: s.id, label: s.full_name }))}
        placeholder={t('addStudent')}
        emptyText={t('noStudentsFound')}
        clearLabel={tCommon('actions.clear')}
      />

      {value.map((id) => (
        <input key={id} type="hidden" name="student_ids" value={id} />
      ))}
    </div>
  )
}
